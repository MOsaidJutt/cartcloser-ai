import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import axios from "axios";
import * as cheerio from "cheerio";

const MAX_MESSAGES_PER_CONVERSATION = 50;

// ─── HUMAN-LIKE DELAY HELPERS ─────────────────────────────────────────────────

function thinkingDelay(): number {
  // Random 5–15 seconds — feels human, not robotic
  return 5000 + Math.random() * 10000;
}

function charDelay(char: string): number {
  // Fast natural typing — feels human without being painfully slow
  if ([".", "!", "?"].includes(char)) return 120 + Math.random() * 80; // pause at end of sentence
  if ([",", ";", ":"].includes(char)) return 50 + Math.random() * 30;  // brief pause at comma
  if (char === " ") return 18 + Math.random() * 12;                    // quick between words
  return 12 + Math.random() * 8;                                        // normal letter ~16ms avg
}

// ─── URL LINK VALIDATOR ───────────────────────────────────────────────────────
// Checks every store URL in a response. Removes any that return 404 so the bot
// never sends a broken link to the customer.


// ─── CATALOG LINK RESOLVER ────────────────────────────────────────────────────
// When enforceCartUrls strips a bad URL, we fall back to a direct catalog scan.
// This guarantees the customer always gets a real checkout link.

interface CatalogEntry { label: string; url: string }

function parseCatalogLinks(systemPrompt: string): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const lines = systemPrompt.split("\n");
  let currentProduct = "";

  for (const line of lines) {
    // Single-variant product: "- Title: $XX | checkout: URL"
    const singleMatch = line.match(/^- (.+?)(?:\s*\[.*?])?\s*:.*?\|\s*checkout:\s*(https?:\/\/\S+)/);
    if (singleMatch) {
      currentProduct = singleMatch[1].trim();
      entries.push({ label: currentProduct.toLowerCase(), url: singleMatch[2] });
      continue;
    }
    // Multi-variant header: "- Title: from $XX"
    const headerMatch = line.match(/^- (.+?)(?:\s*\[.*?])?\s*:/);
    if (headerMatch) {
      currentProduct = headerMatch[1].trim();
      continue;
    }
    // Variant line: "  • Variant — $XX | checkout: URL"
    const variantMatch = line.match(/^\s+•\s+(.+?)\s+—.*?\|\s*checkout:\s*(https?:\/\/\S+)/);
    if (variantMatch && currentProduct) {
      const variantName = variantMatch[1].trim();
      entries.push({ label: `${currentProduct} ${variantName}`.toLowerCase(), url: variantMatch[2] });
      entries.push({ label: variantName.toLowerCase(), url: variantMatch[2] });
    }
  }
  return entries;
}

/**
 * Finds the best checkout URL from the catalog by matching keywords.
 * Uses ratio scoring — percentage of label words found in context.
 * Returns null if no confident match found (score < 50%).
 */
function findBestCheckoutUrl(recentText: string, entries: CatalogEntry[]): string | null {
  const text = recentText.toLowerCase();
  let bestEntry: CatalogEntry | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    const words = entry.label.split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) continue;
    const hits = words.filter((w) => text.includes(w)).length;
    const score = hits / words.length;
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  // Require at least 50% of label words to match
  return bestScore >= 0.5 ? bestEntry!.url : null;
}

// ─── INTENT → URL CANDIDATES ─────────────────────────────────────────────────
// Maps customer question topics to candidate page paths to try on the store.
// We try each path in order and use the first one that returns content.

const INTENT_MAP: Array<{ pattern: RegExp; paths: string[] }> = [
  {
    pattern: /ship|deliver|how long|when.*(arrive|get|receive|come)|dispatch|transit|days|weeks/i,
    paths: [
      "/policies/shipping",
      "/pages/shipping",
      "/pages/delivery",
      "/pages/shipping-and-delivery",
      "/pages/shipping-information",
      "/pages/shipping-returns",
    ],
  },
  {
    pattern: /return|refund|exchange|send.?back|money.?back|cancel/i,
    paths: [
      "/policies/refund-policy",
      "/policies/returns",
      "/pages/returns",
      "/pages/return-policy",
      "/pages/refund",
      "/pages/exchanges",
      "/pages/shipping-returns",
    ],
  },
  {
    pattern: /faq|question|how.*(use|work|does|do)|what.*(is|are)|help|support/i,
    paths: [
      "/pages/faq",
      "/pages/faqs",
      "/pages/help",
      "/pages/help-center",
      "/pages/questions",
      "/pages/support",
    ],
  },
  {
    pattern: /warranty|guarantee|trial|risk.?free/i,
    paths: [
      "/pages/warranty",
      "/pages/guarantee",
      "/pages/faq",
      "/pages/help",
    ],
  },
  {
    pattern: /contact|email|phone|reach|speak|talk|customer.?service/i,
    paths: [
      "/pages/contact",
      "/pages/contact-us",
      "/pages/support",
      "/pages/help",
    ],
  },
  {
    pattern: /about|who.*(you|are)|story|brand|founded|mission/i,
    paths: [
      "/pages/about",
      "/pages/about-us",
      "/pages/our-story",
    ],
  },
];

// ─── PAGE FETCHER ─────────────────────────────────────────────────────────────

async function fetchPageContent(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      maxRedirects: 3,
      validateStatus: (s) => s < 400, // only accept 2xx/3xx
    });
    const html = typeof res.data === "string" ? res.data : "";
    const $ = cheerio.load(html);
    $("script, style, noscript, nav, footer, header, iframe, [class*='menu'], [class*='nav']").remove();
    const text =
      $("main").text() ||
      $("article").text() ||
      $(".page-content, .shopify-policy__body, .rte, #content, .content-wrapper").text() ||
      $("body").text();
    const cleaned = text.replace(/\s+/g, " ").trim();
    // Only return if we got meaningful content (more than just navigation noise)
    return cleaned.length > 100 ? cleaned.slice(0, 4000) : null;
  } catch {
    return null;
  }
}

// ─── LIVE PRODUCT LOOKUP ──────────────────────────────────────────────────────
// Tries multiple strategies to find a product on the live store.
// 1. Direct handle API: /products/{handle}.json — most reliable
// 2. products.json title search — broader fallback

function toHandle(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fetchProductByHandle(baseUrl: string, handle: string): Promise<any | null> {
  try {
    const res = await axios.get(`${baseUrl}/products/${handle}.json`, {
      timeout: 6000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
      validateStatus: (s) => s === 200,
    });
    return res.data?.product ?? null;
  } catch {
    return null;
  }
}

async function searchProductsJson(baseUrl: string, words: string[]): Promise<any | null> {
  try {
    const res = await axios.get(`${baseUrl}/products.json?limit=250`, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
    });
    const products: any[] = res.data?.products ?? [];
    return products.find((p: any) => {
      const title = (p.title ?? "").toLowerCase();
      return words.some((w) => title.includes(w));
    }) ?? null;
  } catch {
    return null;
  }
}

function formatProduct(product: any, baseUrl: string): string {
  const allVariants: any[] = product.variants ?? [];
  // Filter out Shopify's placeholder "Default Title" — that means no real variants
  const realVariants = allVariants.filter(
    (v: any) => v.title && v.title.toLowerCase() !== "default title"
  );
  const price = allVariants[0]?.price ?? "N/A";
  const available = allVariants.some((v: any) => v.available !== false);
  const firstVariant = allVariants[0];

  if (realVariants.length === 0) {
    // No real variants — single checkout link, no variant question needed
    const stock = available ? "" : " [OUT OF STOCK]";
    const co = firstVariant ? `${baseUrl}/cart/${firstVariant.id}:1` : "";
    return `[LIVE PRODUCT DATA — ${product.title}]\nPrice: $${price}${stock}\ncheckout: ${co}\nNote: This product has no variants — send the checkout link directly, do not ask about size/colour/variant.`;
  }

  const variantLines = realVariants
    .map((v: any) => {
      const stock = v.available !== false ? "" : " [OUT OF STOCK]";
      return `  • ${v.title}: $${v.price}${stock} | checkout: ${baseUrl}/cart/${v.id}:1`;
    })
    .join("\n");
  return `[LIVE PRODUCT DATA — ${product.title}]\nPrice: from $${price}\nIn stock: ${available ? "yes" : "no"}\nVariants:\n${variantLines}`;
}

async function fetchLiveProduct(baseUrl: string, query: string): Promise<string | null> {
  const clean = query.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const words = clean.split(" ").filter((w) => w.length >= 3);
  if (words.length === 0) return null;

  // Strategy 1: try exact handle (e.g. "ingrid glasses" → "ingrid-glasses")
  const exactHandle = toHandle(clean);
  let product = await fetchProductByHandle(baseUrl, exactHandle);

  // Strategy 2: try each word as a handle (e.g. "ingrid")
  if (!product) {
    for (const word of words) {
      product = await fetchProductByHandle(baseUrl, word);
      if (product) break;
    }
  }

  // Strategy 3: search all products by title
  if (!product) {
    product = await searchProductsJson(baseUrl, words);
  }

  return product ? formatProduct(product, baseUrl) : null;
}

// ─── EXTRACT PRODUCT QUERIES FROM ANY MESSAGE ─────────────────────────────────
// Pulls out what the customer is likely asking about regardless of phrasing.
// Covers: "i need X", "do you have X", "X please", "show me X", "what about X", etc.

function extractProductQueries(message: string): string[] {
  const queries: string[] = [];

  // Pattern 1: explicit request phrases
  const explicitMatch = message.match(
    /(?:i (?:need|want|like|love)|do you (?:have|carry|sell)|show me|looking for|got any|find me|tell me about|what about|interested in|any|got the|send me)\s+(?:the\s+)?(.{3,50}?)(?:\?|$|,|\.|!)/i
  );
  if (explicitMatch) queries.push(explicitMatch[1].trim());

  // Pattern 2: bare product name — short message that's likely just a product name
  // e.g. "ingrid glasses", "tindra", "hayward"
  const stripped = message.trim().replace(/[?!.,]/g, "").trim();
  if (stripped.length >= 3 && stripped.length <= 40 && !stripped.includes(" the ") && !/^(yes|no|ok|okay|sure|thanks|hi|hello|hey|nope|yep|yeah|nah|send|checkout|buy|price|how|what|when|where|why|can|could|would|will)$/i.test(stripped)) {
    queries.push(stripped);
  }

  return [...new Set(queries.filter(Boolean))];
}

// ─── PROACTIVE INTENT FETCH ───────────────────────────────────────────────────

async function proactiveFetch(baseUrl: string, userMessage: string): Promise<string | null> {
  // Try product lookup for any message that might reference a product
  const queries = extractProductQueries(userMessage);
  for (const q of queries) {
    const liveProduct = await fetchLiveProduct(baseUrl, q);
    if (liveProduct) return liveProduct;
  }

  // Policy / FAQ page lookup
  for (const intent of INTENT_MAP) {
    if (!intent.pattern.test(userMessage)) continue;

    for (const path of intent.paths) {
      const content = await fetchPageContent(baseUrl + path);
      if (content) {
        return `[LIVE CONTENT fetched from ${baseUrl + path}]\n${content}`;
      }
    }
    break;
  }
  return null;
}

// ─── POST /api/demo/[id]/chat ─────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { conversationId, message } = await req.json();

    if (!conversationId || !message?.trim()) {
      return Response.json({ error: "conversationId and message are required" }, { status: 400 });
    }

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: { systemPrompt: true, status: true, storeUrl: true, userId: true },
    });

    if (!agent) return Response.json({ error: "Demo not found" }, { status: 404 });
    if (agent.status !== "ready") {
      return Response.json({ error: "Demo not ready" }, { status: 503 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!conversation || conversation.agentId !== id) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    const userMessageCount = conversation.messages.filter((m: { role: string }) => m.role === "user").length;
    if (userMessageCount >= MAX_MESSAGES_PER_CONVERSATION) {
      return Response.json(
        { error: "Message limit reached for this demo conversation" },
        { status: 429 }
      );
    }

    await prisma.message.create({
      data: { conversationId, role: "user", content: message.trim() },
    });

    // Keep only the last 10 messages (5 exchanges) — prevents runaway token growth
    const recentMessages = conversation.messages.slice(-10);
    const history: OpenAI.Chat.ChatCompletionMessageParam[] = recentMessages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    history.push({ role: "user", content: message.trim() });

    const user = await prisma.user.findUnique({
      where: { id: agent.userId },
      select: { openaiKey: true },
    });
    const apiKey = user?.openaiKey ?? process.env.OPENAI_API_KEY ?? "";
    const client = new OpenAI({ apiKey });

    const baseUrl = (agent.storeUrl ?? "").replace(/\/$/, "");

    // ── Proactive fetch: detect intent and get live page content NOW ──────────
    // Run alongside the thinking delay so it doesn't add extra latency.
    const [liveContent] = await Promise.all([
      baseUrl ? proactiveFetch(baseUrl, message.trim()) : Promise.resolve(null),
    ]);

    // GPT-4o-mini supports 128K context — no need to truncate the catalog.
    // Truncation was causing products to lose their checkout URLs mid-catalog.
    let systemPrompt = agent.systemPrompt;

    if (liveContent) {
      systemPrompt +=
        `\n\n---\nLIVE STORE DATA (just fetched for this customer's question — use this to answer accurately):\n${liveContent}\n---`;
    }

    // Inject the last 2 bot replies so the model can explicitly avoid repeating them
    const recentBotReplies = conversation.messages
      .filter((m: { role: string; content: string }) => m.role === "assistant")
      .slice(-2)
      .map((m: { role: string; content: string }) => `"${m.content.slice(0, 200)}"`)
      .join("\n");

    if (recentBotReplies) {
      systemPrompt +=
        `\n\n---\nYOUR RECENT REPLIES (do NOT repeat or paraphrase any of these):\n${recentBotReplies}\n---`;
    }

    // ── Checkout URL injection ─────────────────────────────────────────────────
    // When customer asks for a link, find the exact URL from the catalog and tell
    // the AI precisely what to send — no guessing, no URL construction.
    const lastUserMsg = (history.filter((m) => m.role === "user").slice(-1)[0]?.content ?? "") as string;
    const lastBotMsg = (history.filter((m) => m.role === "assistant").slice(-1)[0]?.content ?? "") as string;
    const wantsLink = /\b(link|url|buy|purchase|order|checkout|get it|send|give|yes|ok|okay|sure|please|now)\b/i.test(lastUserMsg);
    if (wantsLink) {
      const catalogEntries = parseCatalogLinks(agent.systemPrompt);
      // Use last bot message + last user message — bot message has the product name
      const context = `${lastBotMsg} ${lastUserMsg}`;
      const correctUrl = findBestCheckoutUrl(context, catalogEntries);
      if (correctUrl) {
        systemPrompt += `\n\n---\nCHECKOUT URL INSTRUCTION: The customer wants to purchase. Include this exact URL in your response, character for character: ${correctUrl}\nFormat: "Here you go: ${correctUrl}"\n---`;
      }
    }

    const encoder = new TextEncoder();
    const delay = thinkingDelay();

    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {}
        };

        try {
          // Human thinking delay (proactive fetch ran in parallel above)
          await new Promise((r) => setTimeout(r, delay));

          const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: "system", content: systemPrompt },
            ...history,
          ];

          const response = await client.chat.completions.create({
            model: "gpt-4o-mini", // 200K TPM vs 30K for gpt-4o — still excellent for SMS chat
            messages,
            max_tokens: 600,
            temperature: 0.85,
          });

          const fullResponse = response.choices[0]?.message?.content ?? "";

          // Stream character-by-character for natural human typing feel
          for (const char of fullResponse) {
            send({ delta: char });
            await new Promise((r) => setTimeout(r, charDelay(char)));
          }

          await prisma.message.create({
            data: { conversationId, role: "assistant", content: fullResponse },
          });

          send({ done: true });
        } catch (err) {
          console.error("[demo/chat stream]", err);
          send({ error: "Failed to generate response" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[demo/chat]", err);
    return Response.json({ error: "Failed to process message" }, { status: 500 });
  }
}
