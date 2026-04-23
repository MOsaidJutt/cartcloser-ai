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

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  if (user.email === session.email) return Response.json({ error: "Cannot delete your own account" }, { status: 400 });

  await prisma.user.delete({ where: { id } });

  return Response.json({ success: true });
}
