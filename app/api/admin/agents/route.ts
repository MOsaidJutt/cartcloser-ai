import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();
  if (!isAdmin(session.email)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? "";

  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
    where: search
      ? {
          OR: [
            { storeName: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } },
          ],
        }
      : undefined,
    select: {
      id: true,
      storeName: true,
      storeUrl: true,
      status: true,
      productCount: true,
      conversions: true,
      totalRevenue: true,
      tone: true,
      ghlDeployed: true,
      ghlDeployedAt: true,
      lastRefreshedAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, email: true, planName: true } },
      _count: { select: { conversations: true, coupons: true } },
      coupons: {
        select: { id: true, code: true, active: true, usedCount: true, discountValue: true, discountType: true },
      },
    },
  });

  return Response.json({ agents });
}
