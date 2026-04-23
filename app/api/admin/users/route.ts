import { NextRequest } from "next/server";
import { getSessionUser, unauthorized, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();
  if (!isAdmin(session.email)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      planName: true,
      planStatus: true,
      blocked: true,
      currentPeriodEnd: true,
      createdAt: true,
      agents: {
        select: {
          id: true,
          storeName: true,
          status: true,
          ghlDeployed: true,
          conversions: true,
          totalRevenue: true,
          createdAt: true,
          _count: { select: { conversations: true } },
        },
      },
    },
  });

  return Response.json({ users });
}

export async function POST(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();
  if (!isAdmin(session.email)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { email, password } = await req.json();
  if (!email || !password) return Response.json({ error: "Email and password required" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return Response.json({ error: "Email already in use" }, { status: 409 });

  const hashed = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, password: hashed },
    select: { id: true, email: true, planName: true, planStatus: true, blocked: true, createdAt: true },
  });

  return Response.json({ user }, { status: 201 });
}
