import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();
  if (!isAdmin(session.email)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  await prisma.agent.delete({ where: { id } });

  return Response.json({ success: true });
}
