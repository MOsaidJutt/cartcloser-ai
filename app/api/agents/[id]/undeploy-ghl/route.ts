import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── DELETE — undeploy agent from GHL ────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;
  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  await prisma.agent.update({
    where: { id },
    data: {
      ghlDeployed: false,
      ghlDeployedAt: null,
      ghlWebhookSecret: null,
    } as any,
  });

  return Response.json({ deployed: false });
}
