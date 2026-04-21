import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
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
