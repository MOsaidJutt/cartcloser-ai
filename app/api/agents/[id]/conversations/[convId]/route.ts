import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── GET — full message thread for a conversation ─────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; convId: string }> }
) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id, convId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: convId, agentId: id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

  return Response.json({ conversation });
}
