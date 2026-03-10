import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/system-prompt";

// ─── GET /api/agents/[id] ─────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id, userId: session.userId },
  });

  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  return Response.json({ agent });
}

// ─── PUT /api/agents/[id] — Update agent config ────────────────────────────────

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  try {
    const { botName, openingMessage, couponCode, couponDiscount, tone, currency } =
      await req.json();

    // Rebuild system prompt with updated config
    const systemPrompt = buildSystemPrompt({
      botName: botName ?? agent.botName,
      storeName: agent.storeName,
      storeUrl: agent.storeUrl,
      knowledgeBase: agent.knowledgeBase,
      couponCode: couponCode ?? agent.couponCode,
      couponDiscount: couponDiscount ?? agent.couponDiscount,
      tone: tone ?? agent.tone,
    });

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        ...(botName !== undefined && { botName }),
        ...(openingMessage !== undefined && { openingMessage }),
        ...(couponCode !== undefined && { couponCode }),
        ...(couponDiscount !== undefined && { couponDiscount }),
        ...(tone !== undefined && { tone }),
        ...(currency !== undefined && { currency }),
        systemPrompt,
      },
    });

    return Response.json({ agent: updated });
  } catch (err) {
    console.error("[agents/[id] PUT]", err);
    return Response.json({ error: "Failed to update agent" }, { status: 500 });
  }
}

// ─── DELETE /api/agents/[id] ─────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  // Conversations and messages cascade-delete via Prisma schema
  await prisma.agent.delete({ where: { id } });

  return Response.json({ message: "Agent deleted" });
}
