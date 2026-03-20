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

async function checkUrl(url: string): Promise<"ok" | "dead"> {
  try {
    const res = await axios.head(url, {
      timeout: 4000,
      maxRedirects: 3,
      validateStatus: () => true, // don't throw on any status
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });
    // 404 = definitely dead. Anything else (200, 301, 302, 403…) = reachable.
    return res.status === 404 ? "dead" : "ok";
  } catch {
    // Network error — don't remove the link, might be a temporary blip
    return "ok";
  }
}

/**
 * Removes any store-domain URLs from `text` that return 404.
 * Cart/checkout URLs that are dead get removed entirely.
 * All checks run in parallel to keep latency low.
 */
async function sanitizeLinks(text: string, baseUrl: string): Promise<string> {
  if (!baseUrl) return text;

  let storeDomain: string;
  try {
    storeDomain = new URL(baseUrl).hostname;
  } catch {
    return text;
  }

  // Match all URLs in the text
  const urlRegex = /https?:\/\/[^\s,)"']+/g;
  const allUrls = [...new Set(text.match(urlRegex) ?? [])];

  // Only check URLs on the store's own domain — skip real /cart/{id}:{qty} URLs
  // (those require a session cookie) but DO validate fake /checkout/product-slug URLs
  const storeUrls = allUrls.filter((u) => {
    try {
      const parsed = new URL(u);
      if (parsed.hostname !== storeDomain) return false;
      // Only skip real Shopify cart URLs — variant IDs are 10+ digits
      const cartMatch = parsed.pathname.match(/^\/cart\/(\d+):\d+$/);
      if (cartMatch && cartMatch[1].length >= 10) return false; // real cart URL — skip check
      return true;
    } catch {
      return false;
    }
  });

  if (storeUrls.length === 0) return text;

  // Check all in parallel
  const results = await Promise.all(
    storeUrls.map(async (url) => ({ url, status: await checkUrl(url) }))
  );

  let cleaned = text;
  for (const { url, status } of results) {
    if (status === "dead") {
      // Remove the URL and clean up any trailing punctuation/whitespace around it
      cleaned = cleaned
        .replace(new RegExp(`\\s*${escapeRegex(url)}[.,!?]*`, "g"), "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
  }

  return cleaned;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips any store-domain URL that is NOT a valid /cart/{variantId}:{qty} format.
 * The AI sometimes constructs fake checkout URLs like /checkout/product-name — these never work.
 * Only real Shopify cart URLs (/cart/12345678:1) are allowed through.
 */
function enforceCartUrls(text: string, baseUrl: string): string {
  if (!baseUrl) return text;
  let domain: string;
  try {
    domain = new URL(baseUrl).hostname;
  } catch {
    return text;
  }

  return text.replace(/https?:\/\/[^\s,)"']+/g, (urlRaw) => {
    const url = urlRaw.replace(/[.,!?]+$/, "");
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== domain) return urlRaw; // not store domain — keep
      // Real Shopify variant IDs are 10+ digits — reject short/fake IDs like 12345678
      const cartMatch = parsed.pathname.match(/^\/cart\/(\d+):\d+$/);
      if (cartMatch && cartMatch[1].length >= 10) return urlRaw; // valid cart URL — keep
      // Invalid store URL (AI-constructed) — remove it
      return "";
    } catch {
      return urlRaw;
    }
  }).replace(/Here you go:\s*[.,]?\s*$/gim, "Let me get that link — just a moment.")
    .replace(/\s{2,}/g, " ")
    .trim();
}

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
 * Finds the best checkout URL from the catalog by matching keywords
 * from the recent conversation. Returns null if no confident match found.
 */
function findBestCheckoutUrl(recentText: string, entries: CatalogEntry[]): string | null {
  const text = recentText.toLowerCase();
  // Sort by label length descending — prefer more specific matches
  const sorted = [...entries].sort((a, b) => b.label.length - a.label.length);
  for (const entry of sorted) {
    const words = entry.label.split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) continue;
    const hits = words.filter((w) => text.includes(w)).length;
    if (hits >= Math.min(2, words.length)) return entry.url;
  }
  return null;
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

    // Build system prompt — cap KB at ~20K chars so we stay safely under TPM limits.
    // The knowledge base is at the END of systemPrompt, so truncation cuts excess products,
    // not the persona/rules at the top which are most important.
    const MAX_SYSTEM_CHARS = 20000;
    let systemPrompt = agent.systemPrompt.length > MAX_SYSTEM_CHARS
      ? agent.systemPrompt.slice(0, MAX_SYSTEM_CHARS) + "\n[...catalog truncated for length]"
      : agent.systemPrompt;

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

    // ── Proactive checkout URL injection ──────────────────────────────────────
    // If the customer is asking for a link, find the correct URL from the catalog
    // and tell the AI EXACTLY what URL to use — no guessing, no construction.
    const lastUserMsg = history.filter((m) => m.role === "user").slice(-1)[0]?.content as string ?? "";
    const wantsLink = /\b(link|url|buy|purchase|order|checkout|get it|send|give|yes|ok|okay|sure|please|now)\b/i.test(lastUserMsg);
    if (wantsLink) {
      const catalogEntries = parseCatalogLinks(agent.systemPrompt);
      const recentText = history.slice(-8).map((m) => m.content as string).join(" ");
      const correctUrl = findBestCheckoutUrl(recentText, catalogEntries);
      if (correctUrl) {
        systemPrompt += `\n\n---\nCHECKOUT URL INSTRUCTION: The customer wants to purchase now. Send them this exact URL — copy it character for character, do not change anything: ${correctUrl}\nYour response must include: "Here you go: ${correctUrl}"\n---`;
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

          const rawResponse = response.choices[0]?.message?.content ?? "";

          // Step 1: Strip any AI-constructed store URLs that aren't valid /cart/{id}:{qty} format
          const cartEnforced = enforceCartUrls(rawResponse, baseUrl);

          // Step 2: Validate remaining store URLs — strip any that return 404
          let fullResponse = await sanitizeLinks(cartEnforced, baseUrl);

          // Step 3: If the AI intended to send a checkout link but produced a bad URL,
          // recover by doing a direct catalog scan using recent conversation context.
          const linkStripped = /Let me get that link — just a moment/i.test(fullResponse) ||
            /Here you go:\s*$/i.test(fullResponse);
          if (linkStripped && agent.systemPrompt) {
            const catalogEntries = parseCatalogLinks(agent.systemPrompt);
            const recentText = history.slice(-6).map((m) => m.content as string).join(" ");
            const correctUrl = findBestCheckoutUrl(recentText, catalogEntries);
            if (correctUrl) {
              fullResponse = fullResponse
                .replace(/Let me get that link — just a moment\.?/i, `Here you go: ${correctUrl}`)
                .replace(/Here you go:\s*$/i, `Here you go: ${correctUrl}`);
            }
          }

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
