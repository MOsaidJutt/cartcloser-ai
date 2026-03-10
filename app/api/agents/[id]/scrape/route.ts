import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeShopifyStore } from "@/lib/scraper";
import { buildKnowledgeBase } from "@/lib/knowledge-base";
import { buildSystemPrompt } from "@/lib/system-prompt";

// ─── POST /api/agents/[id]/scrape — Re-scrape and rebuild knowledge base ──────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const useAI = body.useAI !== false;

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    const apiKey = user?.openaiKey ?? process.env.OPENAI_API_KEY ?? "";

    // Mark as building
    await prisma.agent.update({ where: { id }, data: { status: "building" } });

    const scraped = await scrapeShopifyStore(agent.storeUrl);
    const kb = await buildKnowledgeBase(scraped, apiKey, useAI);

    const systemPrompt = buildSystemPrompt({
      botName: agent.botName,
      storeName: kb.storeName,
      storeUrl: agent.storeUrl,
      knowledgeBase: kb.knowledgeBase,
      couponCode: agent.couponCode,
      couponDiscount: agent.couponDiscount,
      tone: agent.tone,
    });

    const updated = await prisma.agent.update({
      where: { id },
      data: {
        storeName: kb.storeName,
        knowledgeBase: kb.knowledgeBase,
        systemPrompt,
        productCount: kb.productCount,
        status: "ready",
      },
    });

    return Response.json({ agent: updated, productCount: kb.productCount });
  } catch (err: any) {
    await prisma.agent.update({ where: { id }, data: { status: "error" } });
    console.error("[agents/[id]/scrape]", err);
    return Response.json({ error: err.message ?? "Scrape failed" }, { status: 500 });
  }
}
