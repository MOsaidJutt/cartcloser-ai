import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/track/[agentId]/conversion
// Called client-side when a visitor clicks a checkout link in the demo chat.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  try {
    const body = await req.json().catch(() => ({}));
    const { conversationId, checkoutUrl } = body;

    await prisma.agent.update({
      where: { id: agentId },
      data: { conversions: { increment: 1 } },
    });

    if (conversationId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          checkoutClickedAt: new Date(),
          ...(checkoutUrl ? { lastCheckoutUrl: checkoutUrl } : {}),
        },
      }).catch(() => {});
    }

    // Increment usedCount on the active coupon for this agent (if any)
    if (agentId) {
      const activeCoupon = await prisma.coupon.findFirst({
        where: { agentId, active: true },
        orderBy: { createdAt: "desc" },
      });
      if (activeCoupon) {
        await prisma.coupon.update({
          where: { id: activeCoupon.id },
          data: { usedCount: { increment: 1 } },
        }).catch(() => {});
      }
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false });
  }
}
