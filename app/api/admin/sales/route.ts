import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();
  if (!isAdmin(session.email)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter"); // "converted" | "checkout" | "all"

  const whereClause: any = {};
  if (filter === "converted") {
    whereClause.convertedAt = { not: null };
  } else if (filter === "checkout") {
    whereClause.checkoutClickedAt = { not: null };
    whereClause.convertedAt = null;
  }

  const conversations = await prisma.conversation.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      visitorName: true,
      productName: true,
      checkoutClickedAt: true,
      lastCheckoutUrl: true,
      convertedAt: true,
      shopifyOrderId: true,
      shopifyOrderTotal: true,
      createdAt: true,
      agent: {
        select: {
          id: true,
          storeName: true,
          currency: true,
          user: { select: { id: true, email: true } },
        },
      },
      _count: { select: { messages: true } },
    },
  });

  return Response.json({ conversations });
}
