import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/system-prompt";

// ─── GET — list all coupons for an agent ─────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;
  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const coupons = await (prisma as any).coupon.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ coupons });
}

// ─── POST — create a new coupon and set it as active on the agent ─────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;
  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const { code, discountType, discountValue } = await req.json();

  if (!code?.trim() || !discountValue?.trim()) {
    return Response.json({ error: "Code and discount value required" }, { status: 400 });
  }

  // Create the coupon
  const coupon = await (prisma as any).coupon.create({
    data: {
      agentId: id,
      code: code.trim().toUpperCase(),
      discountType: discountType ?? "percentage",
      discountValue: discountValue.trim(),
      active: true,
    },
  });

  // Format discount label for system prompt e.g. "10%" or "$10"
  const discountLabel =
    discountType === "fixed"
      ? `${(agent as any).currency ?? "$"}${discountValue}`
      : `${discountValue}%`;

  // Update agent's active coupon fields + rebuild system prompt
  const systemPrompt = buildSystemPrompt({
    botName: agent.botName,
    storeName: agent.storeName,
    storeUrl: agent.storeUrl,
    knowledgeBase: agent.knowledgeBase,
    couponCode: coupon.code,
    couponDiscount: discountLabel,
    tone: agent.tone,
    config: JSON.parse((agent as any).config ?? "{}"),
  });

  await prisma.agent.update({
    where: { id },
    data: { couponCode: coupon.code, couponDiscount: discountLabel, systemPrompt },
  });

  const coupons = await (prisma as any).coupon.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ coupon, coupons });
}

// ─── PATCH — activate, deactivate, or delete a coupon ─────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;
  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const { couponId, action } = await req.json(); // action: "activate" | "deactivate" | "delete"

  if (action === "delete") {
    // Read coupon before deleting so we know if it was the active one
    const toDelete = await (prisma as any).coupon.findUnique({ where: { id: couponId } }).catch(() => null);
    await (prisma as any).coupon.delete({ where: { id: couponId } });

    // If this was the active coupon, clear agent coupon fields and rebuild system prompt
    if (toDelete && (agent as any).couponCode === toDelete.code) {
      const systemPrompt = buildSystemPrompt({
        botName: agent.botName, storeName: agent.storeName, storeUrl: agent.storeUrl,
        knowledgeBase: agent.knowledgeBase, couponCode: null, couponDiscount: null,
        tone: agent.tone, config: JSON.parse((agent as any).config ?? "{}"),
      });
      await prisma.agent.update({ where: { id }, data: { couponCode: null, couponDiscount: null, systemPrompt } });
    }
  } else {
    const coupon = await (prisma as any).coupon.findUnique({ where: { id: couponId } });
    if (!coupon) return Response.json({ error: "Coupon not found" }, { status: 404 });

    await (prisma as any).coupon.update({
      where: { id: couponId },
      data: { active: action === "activate" },
    });

    // Update agent's active coupon
    const discountLabel =
      coupon.discountType === "fixed"
        ? `${(agent as any).currency ?? "$"}${coupon.discountValue}`
        : `${coupon.discountValue}%`;

    const newCode    = action === "activate" ? coupon.code : null;
    const newDiscount = action === "activate" ? discountLabel : null;

    const systemPrompt = buildSystemPrompt({
      botName: agent.botName, storeName: agent.storeName, storeUrl: agent.storeUrl,
      knowledgeBase: agent.knowledgeBase,
      couponCode: newCode, couponDiscount: newDiscount,
      tone: agent.tone, config: JSON.parse((agent as any).config ?? "{}"),
    });

    await prisma.agent.update({
      where: { id },
      data: { couponCode: newCode, couponDiscount: newDiscount, systemPrompt },
    });
  }

  const coupons = await (prisma as any).coupon.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ coupons });
}
