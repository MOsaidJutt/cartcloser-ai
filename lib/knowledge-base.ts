import OpenAI from "openai";
import type { ScrapedStore } from "./scraper";
import { crawlShopifyStore, type CrawledPage, type ProgressCallback } from "./crawler";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface KnowledgeBaseResult {
  knowledgeBase: string;
  storeName: string;
  storeLogo: string | null;
  productCount: number;
  saleCount: number;
  featuredProduct: { title: string; price: string; url: string } | null;
  crawledPageCount: number;
}

// ─── TOKEN ESTIMATION ─────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── PROGRAMMATIC CATALOG ─────────────────────────────────────────────────────
// Built directly from scraped data — NEVER passed through AI.
// This guarantees every product appears, no truncation, no AI "summarization".

function buildCatalogSection(data: ScrapedStore): string {
  let baseUrl = "";
  try { baseUrl = new URL(data.storeUrl).origin; } catch {}

  const lines: string[] = [];

  for (const p of data.products) {
    const sale = p.onSale ? ` [SALE — was $${p.compareAtPrice}]` : "";
    const stock = p.available ? "" : " [OUT OF STOCK]";
    const defaultCheckout = p.checkoutUrl ?? p.productUrl;

    // Filter out Shopify's placeholder "Default Title" — that means no real variants
    const realVariants = p.variants.filter(
      (v) => v.title && v.title.toLowerCase() !== "default title"
    );

    if (realVariants.length <= 1) {
      lines.push(`- ${p.title}: $${p.price}${sale}${stock} | page: ${p.productUrl} | checkout: ${defaultCheckout}`);
    } else {
      // List every real variant with its own checkout URL and stock status
      lines.push(`- ${p.title}: from $${p.price}${sale}${stock} | page: ${p.productUrl}`);
      for (const v of realVariants) {
        const co = baseUrl ? `${baseUrl}/cart/${v.id}:1` : defaultCheckout;
        const variantStock = v.available ? "" : " [OUT OF STOCK]";
        lines.push(`  • ${v.title} — $${v.price}${variantStock} | checkout: ${co}`);
      }
    }
  }

  return `## PRODUCT CATALOG (${data.productCount} products — ALL listed below)\n${lines.join("\n")}`;
}

function buildSaleCatalogSection(data: ScrapedStore): string {
  const saleProducts = data.products.filter((p) => p.onSale);
  if (saleProducts.length === 0) return "## CURRENT DEALS & PROMOTIONS\nNo active sale items.";

  let baseUrl = "";
  try { baseUrl = new URL(data.storeUrl).origin; } catch {}

  const lines = saleProducts.map((p) => {
    const firstVariant = p.variants[0];
    const co = firstVariant && baseUrl ? `${baseUrl}/cart/${firstVariant.id}:1` : (p.checkoutUrl ?? p.productUrl);
    return `- ${p.title}: $${p.price} (was $${p.compareAtPrice}) | page: ${p.productUrl} | checkout: ${co}`;
  });

  return `## CURRENT DEALS & PROMOTIONS\n${lines.join("\n")}`;
}

// ─── CRAWLED CONTEXT ──────────────────────────────────────────────────────────

function buildCrawledContext(pages: CrawledPage[], maxCharsPerPage = 1500): string {
  const priorityOrder = ["page", "policy", "faq", "home", "blog", "collection", "other"];
  const sorted = [...pages].sort(
    (a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type)
  );
  // All pages — no slice limit
  return sorted
    .map((p) => `[${p.type.toUpperCase()}: ${p.title}]\n${p.content.slice(0, maxCharsPerPage)}`)
    .join("\n\n---\n\n");
}

// Split pages into chunks of N for multi-pass AI processing
function chunkPages(pages: CrawledPage[], chunkSize = 15): CrawledPage[][] {
  const chunks: CrawledPage[][] = [];
  for (let i = 0; i < pages.length; i += chunkSize) {
    chunks.push(pages.slice(i, i + chunkSize));
  }
  return chunks;
}

// ─── AI QUALITATIVE ANALYSIS ──────────────────────────────────────────────────
// AI ONLY writes the qualitative sections — store overview, FAQs, shipping details,
// returns policy, brand story, selling points.
// It never writes the product catalog — that's always programmatic.

function buildQualitativePrompt(data: ScrapedStore, crawledContext: string): string {
  return `You are building a knowledge base for an AI SMS sales assistant for "${data.storeName}" (${data.storeUrl}).
The product catalog is handled separately. Your job is ONLY the sections below.

STORE: ${data.storeName} | ${data.storeUrl}
${data.storeDescription ? `DESCRIPTION: ${data.storeDescription}` : ""}
TOTAL PRODUCTS: ${data.productCount}

RETURN/REFUND POLICY:
${(data.policies.refund ?? "Not found").slice(0, 1000)}

SHIPPING POLICY:
${(data.policies.shipping ?? "Not found").slice(0, 1000)}

TERMS:
${(data.policies.terms ?? "Not found").slice(0, 500)}

CRAWLED WEBSITE CONTENT:
${crawledContext}

---
Write ONLY these sections. Be specific — use real facts, timeframes, prices, names from the data above. No generic filler.

## STORE OVERVIEW
What this brand sells, who it's for, what makes it different.

## SHIPPING & DELIVERY
Every shipping option, cost, timeframe, free shipping threshold, international shipping info.

## RETURNS & REFUNDS
Return window, conditions, how to return, refund method, exceptions.

## WARRANTY & GUARANTEES
Product warranties, trial periods, satisfaction guarantees.

## FAQS & COMMON QUESTIONS
Every FAQ with its full answer. Sizing, materials, usage, compatibility, care instructions.

## PRODUCT TECHNOLOGY & DETAILS
Science, materials, technology, certifications, clinical studies if any.

## CUSTOMER SUPPORT
Email, phone, chat, hours, response times, order tracking info.

## ABOUT THE BRAND
Founding story, mission, values, team, location, awards, press.

## KEY SELLING POINTS
Top 5-7 specific reasons to buy from this store vs competitors.`;
}

async function runQualitativeAI(
  client: OpenAI,
  data: ScrapedStore,
  crawledPages: CrawledPage[],
  onProgress?: ProgressCallback
): Promise<string> {
  // Sort by priority — pages/policies/FAQs first (most valuable content up front)
  const priorityOrder = ["page", "policy", "faq", "home", "blog", "collection", "other"];
  const sorted = [...crawledPages].sort(
    (a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type)
  );

  // Process all crawled pages in chunks of 15 to stay under token limits
  const chunks = chunkPages(sorted, 15);
  console.log(`[knowledge-base] Processing ${crawledPages.length} pages in ${chunks.length} chunk(s)`);

  // Emit starting event so UI knows how many chunks there are
  onProgress?.({
    step: "ai",
    label: `Analyzing ${crawledPages.length} pages in ${chunks.length} batches...`,
    count: 0,
    total: chunks.length,
  });

  const chunkResults: string[] = [];
  const PER_CHUNK_TIMEOUT_MS = 60_000; // 60 seconds per API call max

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const crawledContext = buildCrawledContext(chunk, 1500);
    const prompt = buildQualitativePrompt(data, crawledContext);
    const tokens = estimateTokens(prompt);
    console.log(`[knowledge-base] Chunk ${i + 1}/${chunks.length}: ~${tokens} tokens`);

    // Emit per-chunk progress to UI
    onProgress?.({
      step: "ai",
      label: `Analyzing batch ${i + 1} of ${chunks.length}...`,
      count: i + 1,
      total: chunks.length,
    });

    // For the first chunk, generate full structured sections.
    // For subsequent chunks, extract any additional facts not already covered.
    const chunkPrompt = i === 0 ? prompt : `You previously generated a knowledge base for "${data.storeName}". Here are additional pages from their site. Extract any NEW information not already covered — shipping details, return policies, FAQs, product details, brand info — and list it clearly. Skip anything that duplicates what's already been captured. Be concise.

ADDITIONAL PAGES:
${crawledContext}`;

    try {
      const res = await client.chat.completions.create(
        {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: chunkPrompt }],
          max_tokens: i === 0 ? 3500 : 1500,
          temperature: 0.2,
        },
        { signal: AbortSignal.timeout(PER_CHUNK_TIMEOUT_MS) }
      );

      const content = res.choices[0]?.message?.content ?? "";
      if (content.trim()) chunkResults.push(content);
    } catch (err: any) {
      // Timeout or API error on a non-critical chunk — skip it and continue
      if (i === 0) throw err; // First chunk is essential — propagate error
      console.warn(`[knowledge-base] Chunk ${i + 1} skipped (${err.message ?? "timeout"})`);
    }
  }

  // Merge: first chunk is the primary structured output, append supplements
  if (chunkResults.length === 0) return "";
  if (chunkResults.length === 1) return chunkResults[0];

  const [primary, ...supplements] = chunkResults;
  return `${primary}\n\n## ADDITIONAL SITE INFORMATION\n${supplements.join("\n\n---\n\n")}`;
}

// ─── MAIN AI ANALYSIS ─────────────────────────────────────────────────────────

async function analyzeWithAI(
  data: ScrapedStore,
  crawledPages: CrawledPage[],
  apiKey: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const client = new OpenAI({ apiKey });

  // Catalog and sale sections are always programmatic — all products, no AI truncation
  const catalogSection = buildCatalogSection(data);
  const saleSection = buildSaleCatalogSection(data);

  // AI handles only the qualitative sections (FAQs, shipping, brand etc.)
  const qualitativeSections = await runQualitativeAI(client, data, crawledPages, onProgress);

  return `${qualitativeSections}\n\n${saleSection}\n\n${catalogSection}`;
}

// ─── QUICK BUILD (no AI) ──────────────────────────────────────────────────────

function buildQuickKnowledgeBase(data: ScrapedStore, crawledPages: CrawledPage[]): string {
  const crawledContext = buildCrawledContext(crawledPages, 2000);
  const catalogSection = buildCatalogSection(data);
  const saleSection = buildSaleCatalogSection(data);
  const categories = [...new Set(data.products.map((p) => p.productType).filter(Boolean))];

  return `## STORE OVERVIEW
Store: ${data.storeName}
URL: ${data.storeUrl}
${data.storeDescription ? `Description: ${data.storeDescription}` : ""}
Total Products: ${data.productCount}
Categories: ${categories.length > 0 ? categories.join(", ") : "Various"}

## SHIPPING & DELIVERY
${data.policies.shipping || "Contact store for shipping information."}

## RETURNS & REFUNDS
${data.policies.refund || "Contact store for return policy."}

## TERMS
${data.policies.terms ? data.policies.terms.slice(0, 500) : "See website for full terms."}

## SITE CONTENT
${crawledContext}

${saleSection}

${catalogSection}`;
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

export async function buildKnowledgeBase(
  data: ScrapedStore,
  apiKey: string,
  useAI: boolean = true,
  onProgress?: ProgressCallback
): Promise<KnowledgeBaseResult> {
  const crawledPages = await crawlShopifyStore(data.storeUrl, onProgress);

  const knowledgeBase = useAI
    ? await analyzeWithAI(data, crawledPages, apiKey, onProgress)
    : buildQuickKnowledgeBase(data, crawledPages);

  const featured = data.products.find((p) => p.onSale) ?? data.products[0] ?? null;

  return {
    knowledgeBase,
    storeName: data.storeName,
    storeLogo: null,
    productCount: data.productCount,
    saleCount: data.saleProductCount,
    featuredProduct: featured
      ? { title: featured.title, price: featured.price, url: featured.productUrl }
      : null,
    crawledPageCount: crawledPages.length,
  };
}
