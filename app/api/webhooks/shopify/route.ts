import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const maxDuration = 60;

// Verify Shopify HMAC-SHA256 signature
function verifyShopifyHmac(rawBody: string, hmacHeader: string, secret: string): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

// POST /api/webhooks/shopify?agentId=xxx
// Shopify sends orders/paid webhook here. We mark the conversation as converted.
export async function POST(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const shopDomain = req.headers.get("x-shopify-shop-domain") ?? "";
  const topic = req.headers.get("x-shopify-topic") ?? "";

  // Load agent and verify webhook secret
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const webhookSecret = (agent as any).shopifyWebhookSecret as string | null;
  if (webhookSecret && hmacHeader) {
    if (!verifyShopifyHmac(rawBody, hmacHeader, webhookSecret)) {
      console.warn(`[shopify webhook] Invalid HMAC for agent ${agentId}`);
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let order: any;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract customer contact info from order
  const orderId = String(order.id ?? "");
  const orderTotal = order.total_price ?? order.subtotal_price ?? "0";
  const customerPhone = order.customer?.phone ?? order.billing_address?.phone ?? "";
  const customerEmail = order.email ?? order.customer?.email ?? "";

  console.log(`[shopify webhook] Order ${orderId} received for agent ${agentId} — total: $${orderTotal}`);

  // Find all conversations for this agent — match by phone or email
  // GHL stores phone in visitorName or we can search by ghlContactId
  // Best effort: find conversations that aren't already converted
  const conversations = await (prisma as any).conversation.findMany({
    where: {
      agentId,
      convertedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  let matched = 0;
  for (const conv of conversations) {
    const nameMatch =
      customerPhone && conv.visitorName?.replace(/\D/g, "").includes(customerPhone.replace(/\D/g, ""));
    const emailMatch =
      customerEmail && conv.visitorName?.toLowerCase().includes(customerEmail.toLowerCase());

    // If we can match by phone/email, mark as converted
    if (nameMatch || emailMatch) {
      await (prisma as any).conversation.update({
        where: { id: conv.id },
        data: {
          shopifyOrderId: orderId,
          shopifyOrderTotal: String(orderTotal),
          convertedAt: new Date(),
        },
      });
      matched++;
    }
  }

  const orderAmount = parseFloat(String(orderTotal)) || 0;

  // Also increment conversions counter and revenue on agent
  if (matched > 0) {
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        conversions: { increment: matched },
        totalRevenue: { increment: orderAmount },
      } as any,
    });
  }

  // Even if no phone match, record the order against a recent conversation (fallback)
  if (matched === 0 && conversations.length > 0) {
    const recent = conversations[0];
    const minutesAgo = (Date.now() - new Date(recent.createdAt).getTime()) / 60000;
    if (minutesAgo < 30) {
      await (prisma as any).conversation.update({
        where: { id: recent.id },
        data: {
          shopifyOrderId: orderId,
          shopifyOrderTotal: String(orderTotal),
          convertedAt: new Date(),
        },
      });
      await prisma.agent.update({
        where: { id: agentId },
        data: {
          conversions: { increment: 1 },
          totalRevenue: { increment: orderAmount },
        } as any,
      });
    }
  }

  console.log(`[shopify webhook] Matched ${matched} conversation(s) for order ${orderId}`);
  return Response.json({ ok: true, matched });
}
