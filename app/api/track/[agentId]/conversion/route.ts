import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/track/[agentId]/conversion
// Called client-side when a visitor clicks a checkout or product link in the demo chat.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  try {
    await prisma.agent.update({
      where: { id: agentId },
      data: { conversions: { increment: 1 } },
    });
    return Response.json({ ok: true });
  } catch {
    // Don't fail the demo if tracking fails
    return Response.json({ ok: false });
  }
}
