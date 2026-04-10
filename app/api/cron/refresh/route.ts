import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeShopifyStore } from "@/lib/scraper";
import { buildKnowledgeBase } from "@/lib/knowledge-base";
import { buildSystemPrompt } from "@/lib/system-prompt";

// This endpoint is called by Vercel Cron (or Linux cron on Hostinger) once per day.
// It finds all agents whose nextRefreshAt is due and rebuilds their knowledge base.

export const maxDuration = 300;

function computeNextRefresh(interval: number, unit: string): Date {
  const now = new Date();
  if (unit === "day")   now.setDate(now.getDate() + interval);
  if (unit === "week")  now.setDate(now.getDate() + interval * 7);
  if (unit === "month") now.setMonth(now.getMonth() + interval);
  now.setHours(3, 0, 0, 0);
  return now;
}

export async function GET(req: NextRequest) {
  // Auth: accept either Vercel's Authorization header OR ?secret= query param (for Hostinger curl)
  // Vercel passes: Authorization: Bearer ${CRON_SECRET}
  // Hostinger: curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/refresh
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.get("authorization") ?? "";
    const querySecret = req.nextUrl.searchParams.get("secret") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isAuthorized = bearerToken === process.env.CRON_SECRET || querySecret === process.env.CRON_SECRET;
    if (!isAuthorized) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();

  // Find all agents due for a refresh (use prisma as any for new schema fields)
  const agents = await (prisma as any).agent.findMany({
    where: {
      nextRefreshAt: { lte: now },
      refreshInterval: { not: null },
      status: "ready",
    },
  });

  const results: { id: string; storeName: string; status: string; error?: string }[] = [];

  for (const agent of agents) {
    try {
      console.log(`[cron/refresh] Refreshing KB for agent ${agent.id} — ${agent.storeName}`);

      // Get user's OpenAI key
      const user = await prisma.user.findUnique({ where: { id: agent.userId } });
      const apiKey = user?.openaiKey ?? process.env.OPENAI_API_KEY ?? "";

      const storeData = await scrapeShopifyStore(agent.storeUrl);
      const kb = await buildKnowledgeBase(storeData, apiKey, true);

      const systemPrompt = buildSystemPrompt({
        botName:        agent.botName,
        storeName:      agent.storeName,
        storeUrl:       agent.storeUrl,
        knowledgeBase:  kb.knowledgeBase,
        couponCode:     agent.couponCode,
        couponDiscount: agent.couponDiscount,
        tone:           agent.tone,
        config:         JSON.parse(agent.config ?? "{}"),
      });

      await (prisma as any).agent.update({
        where: { id: agent.id },
        data: {
          knowledgeBase:   kb.knowledgeBase,
          systemPrompt,
          productCount:    storeData.productCount,
          lastRefreshedAt: now,
          nextRefreshAt:   computeNextRefresh(agent.refreshInterval, agent.refreshUnit),
        },
      });

      results.push({ id: agent.id, storeName: agent.storeName, status: "refreshed" });
    } catch (err: any) {
      console.error(`[cron/refresh] Failed for agent ${agent.id}:`, err.message);
      results.push({ id: agent.id, storeName: agent.storeName, status: "error", error: err.message });
    }
  }

  return Response.json({ refreshed: results.length, results });
}
