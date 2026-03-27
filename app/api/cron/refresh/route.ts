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
  // Simple secret check to prevent unauthorised triggers
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all agents due for a refresh
  const agents = await prisma.agent.findMany({
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

      const storeData = await scrapeShopifyStore(agent.storeUrl);
      const kb = await buildKnowledgeBase(storeData);

      const systemPrompt = buildSystemPrompt({
        botName:       agent.botName,
        storeName:     agent.storeName,
        storeUrl:      agent.storeUrl,
        knowledgeBase: kb.fullText,
        couponCode:    agent.couponCode,
        couponDiscount: agent.couponDiscount,
        tone:          agent.tone,
        config:        JSON.parse((agent as any).config ?? "{}"),
      });

      const interval  = (agent as any).refreshInterval as number;
      const unit      = (agent as any).refreshUnit as string;

      await prisma.agent.update({
        where: { id: agent.id },
        data: {
          knowledgeBase:   kb.fullText,
          systemPrompt,
          productCount:    storeData.productCount,
          lastRefreshedAt: now,
          nextRefreshAt:   computeNextRefresh(interval, unit),
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
