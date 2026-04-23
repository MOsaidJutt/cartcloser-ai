import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();
  if (!isAdmin(session.email)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const [
    totalUsers,
    totalAgents,
    totalConversations,
    totalMessages,
    revenueAgg,
    conversionsAgg,
    checkoutClicks,
    shopifyConverted,
    ghlDeployed,
    activeToday,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.agent.count(),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.agent.aggregate({ _sum: { totalRevenue: true } }),
    prisma.agent.aggregate({ _sum: { conversions: true } }),
    prisma.conversation.count({ where: { checkoutClickedAt: { not: null } } }),
    prisma.conversation.count({ where: { convertedAt: { not: null } } }),
    prisma.agent.count({ where: { ghlDeployed: true } }),
    prisma.conversation.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  return Response.json({
    totalUsers,
    totalAgents,
    totalConversations,
    totalMessages,
    totalRevenue: revenueAgg._sum.totalRevenue ?? 0,
    totalConversions: conversionsAgg._sum.conversions ?? 0,
    checkoutClicks,
    shopifyConverted,
    ghlDeployed,
    activeToday,
    conversionRate: totalConversations > 0 ? ((checkoutClicks / totalConversations) * 100).toFixed(1) : "0",
  });
}
