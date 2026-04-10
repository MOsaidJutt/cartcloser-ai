import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── GET — list conversations for an agent ────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;
  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const conversations = await prisma.conversation.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1, // last message for preview
      },
      _count: { select: { messages: true } },
    },
  });

  return Response.json({ conversations });
}
