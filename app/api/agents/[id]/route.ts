import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/system-prompt";

// ── Helper: compute next refresh date ────────────────────────────────────────
function computeNextRefresh(interval: number, unit: string): Date {
  const now = new Date();
  if (unit === "day")   now.setDate(now.getDate() + interval);
  if (unit === "week")  now.setDate(now.getDate() + interval * 7);
  if (unit === "month") now.setMonth(now.getMonth() + interval);
  now.setHours(3, 0, 0, 0); // always run at 03:00 UTC
  return now;
}

// ─── GET /api/agents/[id] ─────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id, userId: session.userId },
  });

  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  return Response.json({ agent });
}

// ─── PUT /api/agents/[id] — Update agent config ───────────────────────────────

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  try {
    const body = await req.json();
    const { botName, openingMessage, couponCode, couponDiscount, tone, currency,
            config, refreshInterval, refreshUnit } = body;

    // Serialise config to JSON string for storage
    let configStr: string | undefined;
    if (config !== undefined) {
      configStr = typeof config === "string" ? config : JSON.stringify(config);
    }

    // Parse config object for system prompt rebuild
    const configObj = config !== undefined
      ? (typeof config === "string" ? JSON.parse(config) : config)
      : JSON.parse((agent as any).config ?? "{}");

    // Compute nextRefreshAt when schedule changes
    let refreshData: Record<string, unknown> = {};
    if (refreshInterval !== undefined) {
      if (!refreshInterval || refreshInterval <= 0) {
        // disable schedule
        refreshData = { refreshInterval: null, refreshUnit: null, nextRefreshAt: null };
      } else {
        const unit = refreshUnit ?? (agent as any).refreshUnit ?? "week";
        refreshData = {
          refreshInterval,
          refreshUnit: unit,
          nextRefreshAt: computeNextRefresh(refreshInterval, unit),
        };
      }
    } else if (refreshUnit !== undefined) {
      const interval = (agent as any).refreshInterval;
      if (interval) {
        refreshData = {
          refreshUnit,
          nextRefreshAt: computeNextRefresh(interval, refreshUnit),
        };
      }
    }

    // Rebuild system prompt with all updated settings
    const systemPrompt = buildSystemPrompt({
      botName:         botName         ?? agent.botName,
      storeName:       agent.storeName,
      storeUrl:        agent.storeUrl,
      knowledgeBase:   agent.knowledgeBase,
      couponCode:      couponCode      ?? agent.couponCode,
      couponDiscount:  couponDiscount  ?? agent.couponDiscount,
      tone:            tone            ?? agent.tone,
      config:          configObj,
    });

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        ...(botName        !== undefined && { botName }),
        ...(openingMessage !== undefined && { openingMessage }),
        ...(couponCode     !== undefined && { couponCode }),
        ...(couponDiscount !== undefined && { couponDiscount }),
        ...(tone           !== undefined && { tone }),
        ...(currency       !== undefined && { currency }),
        ...(configStr      !== undefined && { config: configStr }),
        ...refreshData,
        systemPrompt,
      },
    });

    return Response.json({ agent: updated });
  } catch (err) {
    console.error("[agents/[id] PUT]", err);
    return Response.json({ error: "Failed to update agent" }, { status: 500 });
  }
}

// ─── DELETE /api/agents/[id] ─────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  await prisma.agent.delete({ where: { id } });

  return Response.json({ message: "Agent deleted" });
}
