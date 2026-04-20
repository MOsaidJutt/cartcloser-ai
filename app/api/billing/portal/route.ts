import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  const customerId = (user as any)?.stripeCustomerId as string | null;

  if (!customerId) {
    return Response.json({ error: "No billing account found" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/settings`,
  });

  return Response.json({ url: portalSession.url });
}
