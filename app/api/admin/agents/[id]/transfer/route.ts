import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();
  if (!isAdmin(session.email)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { toUserId } = await req.json();
  if (!toUserId) return Response.json({ error: "toUserId required" }, { status: 400 });

  const [agent, targetUser] = await Promise.all([
    prisma.agent.findUnique({ where: { id } }),
    prisma.user.findUnique({ where: { id: toUserId } }),
  ]);

  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
  if (!targetUser) return Response.json({ error: "Target user not found" }, { status: 404 });

  const updated = await prisma.agent.update({
    where: { id },
    data: { userId: toUserId },
    select: { id: true, storeName: true, userId: true },
  });

  return Response.json({ agent: updated });
}
