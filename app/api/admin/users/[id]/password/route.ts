import { NextRequest } from "next/server";
import { getSessionUser, unauthorized, hashPassword } from "@/lib/auth";
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
  const { password } = await req.json();
  if (!password || password.length < 6) {
    return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const hashed = await hashPassword(password);
  await prisma.user.update({ where: { id }, data: { password: hashed } });

  return Response.json({ success: true });
}
