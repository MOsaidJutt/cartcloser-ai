import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── GET /api/agents/[id]/scrape-status — Polling endpoint for scrape progress ─

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id, userId: session.userId },
    select: { id: true, status: true, productCount: true, storeName: true },
  });

  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  return Response.json({
    status: agent.status,
    productCount: agent.productCount,
    storeName: agent.storeName,
  });
}
