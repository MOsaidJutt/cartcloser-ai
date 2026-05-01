import { NextRequest } from "next/server";

export const maxDuration = 300; // 5 minutes — required for long agent builds on Vercel
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeShopifyStore } from "@/lib/scraper";
import { buildKnowledgeBase } from "@/lib/knowledge-base";
import {
  buildSystemPrompt,
  generateDefaultBotName,
  DEFAULT_OPENING_MESSAGE_TEMPLATE,
} from "@/lib/system-prompt";

// ─── GET /api/agents — List all agents for the authenticated user ──────────────

export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const agents = await prisma.agent.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      storeName: true,
      storeUrl: true,
      storeLogo: true,
      botName: true,
      productCount: true,
      demoViews: true,
      conversions: true,
      totalRevenue: true,
      status: true,
      ghlDeployed: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { conversations: true } },
    },
  });

  return Response.json({ agents });
}

// ─── POST /api/agents — Create agent with SSE progress streaming ──────────────
//
// Streams Server-Sent Events so the UI can show an animated checklist in real time.
// Event format: data: {"step":"sitemap","label":"Reading sitemap.xml...","done":false}\n\n

export async function POST(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  let body: { storeUrl?: string; useAI?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { storeUrl, useAI = true } = body;

  if (!storeUrl) {
    return Response.json({ error: "storeUrl is required" }, { status: 400 });
  }

  // Get the user's OpenAI key before starting the stream
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  const apiKey = user?.openaiKey ?? process.env.OPENAI_API_KEY ?? "";

  if (!apiKey) {
    return Response.json(
      { error: "OpenAI API key not configured. Go to Settings." },
      { status: 400 }
    );
  }

  // Create placeholder agent immediately so we have an ID to update
  const placeholder = await prisma.agent.create({
    data: {
      userId: session.userId,
      storeName: "Building...",
      storeUrl,
      botName: "Building...",
      openingMessage: DEFAULT_OPENING_MESSAGE_TEMPLATE,
      systemPrompt: "",
      knowledgeBase: "",
      status: "building",
    },
  });

  const agentId = placeholder.id;

  // ── SSE Stream ──────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          // Stream may have been closed
        }
      };

      // Every 30s: keep SSE alive + ping Neon so it doesn't go back to sleep during long AI processing
      const keepAlive = setInterval(() => {
        try { controller.enqueue(`: keepalive\n\n`); } catch {}
        prisma.$queryRaw`SELECT 1`.catch(() => {});
      }, 30000);

      try {

        // Step: Scraping products
        send({ step: "products", label: "Fetching product catalog..." });

        const scraped = await scrapeShopifyStore(storeUrl);

        send({
          step: "products",
          label: `Found ${scraped.productCount} products`,
          done: true,
        });

        // Step: Deep site crawl (progress forwarded from crawler)
        const kb = await buildKnowledgeBase(scraped, apiKey, useAI, (progress) => {
          send(progress);
        });

        // All AI batches done — now build the system prompt and save
        const kbSizeKB = Math.round(kb.knowledgeBase.length / 1024);
        console.log(`[agents] KB size: ${kbSizeKB}KB, pages: ${kb.crawledPageCount}`);
        send({ step: "ai", label: `Building system prompt... (${kbSizeKB}KB knowledge base)`, status: "received" });

        const botName = generateDefaultBotName(kb.storeName);

        // Full knowledge base always saved to DB — no truncation.
        // System prompt gets a capped version: GPT-4o-mini has 128K token context
        // (~512KB). We cap at 300KB (~75K tokens) leaving ample room for conversation.
        const MAX_PROMPT_KB_CHARS = 300_000;
        const kbForPrompt = kb.knowledgeBase.length > MAX_PROMPT_KB_CHARS
          ? kb.knowledgeBase.slice(0, MAX_PROMPT_KB_CHARS)
          : kb.knowledgeBase;

        if (kb.knowledgeBase.length > MAX_PROMPT_KB_CHARS) {
          console.log(`[agents] System prompt KB capped at 300KB (full ${kbSizeKB}KB saved to DB)`);
        }

        const systemPrompt = buildSystemPrompt({
          botName,
          storeName: kb.storeName,
          storeUrl,
          knowledgeBase: kbForPrompt, // optimised for OpenAI context window
        });

        const spSizeKB = Math.round(systemPrompt.length / 1024);
        console.log(`[agents] System prompt: ${spSizeKB}KB`);
        send({ step: "ai", label: `Saving to database... (${spSizeKB}KB prompt, ${kbSizeKB}KB full KB)`, status: "received" });

        const agentData = {
          storeName: kb.storeName,
          botName,
          openingMessage: DEFAULT_OPENING_MESSAGE_TEMPLATE,
          systemPrompt,
          knowledgeBase: kb.knowledgeBase, // FULL — no data loss
          productCount: kb.productCount,
          status: "ready" as const,
        };

        const dbStart = Date.now();
        // Use Prisma $transaction with a 60s timeout — properly cancels on timeout (no leaked connections)
        const agent = await prisma.$transaction(
          (tx) => tx.agent.update({ where: { id: agentId }, data: agentData }),
          { timeout: 60_000 }
        );
        console.log(`[agents] DB save took ${Date.now() - dbStart}ms`);

        send({
          step: "ai",
          label: `Done — ${kb.crawledPageCount} pages, ${kbSizeKB}KB saved`,
          done: true,
        });

        // Final event with agent data
        send({
          step: "done",
          label: "Agent ready!",
          done: true,
          agent: {
            id: agent.id,
            storeName: agent.storeName,
            botName: agent.botName,
            productCount: agent.productCount,
            featuredProduct: kb.featuredProduct?.title ?? "your selected items",
          },
        });
      } catch (err: any) {
        console.error("[agents POST SSE]", err);

        // Mark agent as failed
        try {
          await prisma.agent.update({
            where: { id: agentId },
            data: { status: "error" },
          });
        } catch {}

        send({ step: "error", label: err.message ?? "Something went wrong", error: true });
      } finally {
        clearInterval(keepAlive);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Agent-Id": agentId,
    },
  });
}
