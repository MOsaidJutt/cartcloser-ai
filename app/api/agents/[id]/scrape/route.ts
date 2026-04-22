import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeShopifyStore } from "@/lib/scraper";
import { buildKnowledgeBase } from "@/lib/knowledge-base";
import { buildSystemPrompt } from "@/lib/system-prompt";

export const maxDuration = 300;

// ─── POST /api/agents/[id]/scrape — Re-scrape with SSE progress streaming ────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({ where: { id, userId: session.userId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const useAI = body.useAI !== false;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  const apiKey = user?.openaiKey ?? process.env.OPENAI_API_KEY ?? "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(`data: ${JSON.stringify(data)}\n\n`); } catch {}
      };

      try {
        await prisma.agent.update({ where: { id }, data: { status: "building" } });

        send({ step: "products", label: "Fetching product catalog..." });
        const scraped = await scrapeShopifyStore(agent.storeUrl);
        send({ step: "products", label: `Found ${scraped.productCount} products`, done: true });

        const kb = await buildKnowledgeBase(scraped, apiKey, useAI, (progress) => {
          send(progress);
        });

        send({ step: "ai", label: "Rebuilding system prompt..." });

        // Preserve all existing agent settings — only replace knowledge data
        const agentConfig = (() => {
          try { return JSON.parse((agent as any).config ?? "{}"); } catch { return {}; }
        })();

        const systemPrompt = buildSystemPrompt({
          botName: agent.botName,
          storeName: kb.storeName,
          storeUrl: agent.storeUrl,
          knowledgeBase: kb.knowledgeBase,
          couponCode: agent.couponCode,
          couponDiscount: agent.couponDiscount,
          tone: agent.tone,
          config: agentConfig,
        });

        const updated = await prisma.agent.update({
          where: { id },
          data: {
            storeName: kb.storeName,
            knowledgeBase: kb.knowledgeBase,
            systemPrompt,
            productCount: kb.productCount,
            status: "ready",
            lastRefreshedAt: new Date(),
          },
        });

        send({ step: "ai", label: `Done — ${kb.crawledPageCount} pages analyzed`, done: true });

        send({
          step: "done",
          label: "Knowledge base rebuilt!",
          done: true,
          agent: {
            id: updated.id,
            storeName: updated.storeName,
            productCount: updated.productCount,
          },
        });
      } catch (err: any) {
        console.error("[agents/[id]/scrape SSE]", err);
        try { await prisma.agent.update({ where: { id }, data: { status: "error" } }); } catch {}
        send({ step: "error", label: err.message ?? "Scrape failed", error: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
