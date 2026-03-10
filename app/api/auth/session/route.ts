import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) {
    return Response.json({ user: null }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, openaiKey: true, createdAt: true },
  });

  if (!user) {
    return Response.json({ user: null }, { status: 401 });
  }

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      hasOpenaiKey: !!user.openaiKey,
      createdAt: user.createdAt,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const response = Response.json({ message: "Logged out" });
  response.headers.set("Set-Cookie", "token=; Path=/; HttpOnly; Max-Age=0");
  return response;
}
