import { NextRequest } from "next/server";
import { stripe, getPlanByPriceId } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

export const maxDuration = 60;

// Stripe requires the raw body to verify the webhook signature
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error("[stripe webhook] Signature verification failed:", err.message);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan ?? "starter";
        if (!userId) break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = subscription.items.data[0]?.price.id ?? "";
        const planName = getPlanByPriceId(priceId);

        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            planStatus: subscription.status,
            planName: plan ?? planName,
            currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
          } as any,
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        const priceId = sub.items.data[0]?.price.id ?? "";
        const planName = getPlanByPriceId(priceId);

        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeSubscriptionId: sub.id,
            stripePriceId: priceId,
            planStatus: sub.status,
            planName,
            currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
          } as any,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await prisma.user.update({
          where: { id: userId },
          data: {
            stripeSubscriptionId: null,
            stripePriceId: null,
            planStatus: "canceled",
            planName: "free",
            currentPeriodEnd: null,
          } as any,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        if (!customerId) break;

        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId } as any,
          data: { planStatus: "past_due" } as any,
        });
        break;
      }
    }
  } catch (err) {
    console.error("[stripe webhook] Handler error:", err);
  }

  return Response.json({ received: true });
}
