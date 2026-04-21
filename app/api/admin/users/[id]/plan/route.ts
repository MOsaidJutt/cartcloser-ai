import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
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
  const { planName } = await req.json();

  const validPlans = ["free", "starter", "pro", "agency"];
  if (!validPlans.includes(planName)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      planName,
      planStatus: planName === "free" ? "free" : "active",
    },
    select: { id: true, email: true, planName: true, planStatus: true },
  });

  return Response.json({ user: updated });
}
