import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";

export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const planName = ((user as any).planName ?? "free") as keyof typeof PLANS;
  const plan = PLANS[planName] ?? PLANS.free;

  return Response.json({
    planName,
    planStatus: (user as any).planStatus ?? "free",
    currentPeriodEnd: (user as any).currentPeriodEnd ?? null,
    plan,
    hasStripeCustomer: !!(user as any).stripeCustomerId,
  });
}
