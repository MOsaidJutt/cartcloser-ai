import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// ─── POST — deploy agent to GHL (generate webhook secret + mark deployed) ─────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;
  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  // Check GHL is connected
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!(user as any)?.ghlApiToken || !(user as any)?.ghlLocationId) {
    return Response.json(
      { error: "Connect your GHL account in Settings before deploying" },
      { status: 400 }
    );
  }

  // Generate webhook secret (or reuse existing)
  const webhookSecret = (agent as any).ghlWebhookSecret ?? crypto.randomBytes(32).toString("hex");

  await prisma.agent.update({
    where: { id },
    data: {
      ghlDeployed: true,
      ghlDeployedAt: new Date(),
      ghlWebhookSecret: webhookSecret,
    } as any,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookUrl = `${appUrl}/api/webhook/ghl/${id}`;

  return Response.json({
    deployed: true,
    webhookUrl,
    webhookSecret,
    agentId: id,
  });
}
