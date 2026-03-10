import axios from "axios";
import * as cheerio from "cheerio";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  type: "home" | "page" | "policy" | "blog" | "collection" | "faq" | "other";
}

export interface CrawlProgress {
  step: string;
  label: string;
  count?: number;
  total?: number;
  done?: boolean;
}

export type ProgressCallback = (p: CrawlProgress) => void;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT = 12000;
const SKIP_PATH_PREFIXES = [
  "/products/",
  "/cart",
  "/checkout",
  "/account",
  "/orders",
  "/search",
  "/gift_cards",
  "/discount",
  "cdn.shopify",
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      maxRedirects: 3,
    });
    return typeof res.data === "string" ? res.data : null;
  } catch {
    return null;
  }
}

function extractCleanText(html: string, maxLen = 6000): string {
  const $ = cheerio.load(html);
  // Remove noise
  $("script, style, noscript, nav, footer, header, .cookie-bar, .announcement-bar, iframe, [aria-hidden='true']").remove();
  // Prefer main content containers
  const content =
    $("main").text() ||
    $("article").text() ||
    $(".page-content, .page__content, .shopify-policy__body, .rte, .entry-content, .article__content, #content, .content").text() ||
    $("body").text();
  return content.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function getPageType(url: string, baseUrl: string): CrawledPage["type"] {
  const path = url.replace(baseUrl, "").toLowerCase().split("?")[0];
  if (path === "/" || path === "") return "home";
  if (path.startsWith("/policies/")) return "policy";
  if (path.startsWith("/pages/")) return "page";
  if (path.startsWith("/blogs/") || path.startsWith("/blog/")) return "blog";
  if (path.startsWith("/collections/")) return "collection";
  if (path.includes("faq") || path.includes("help") || path.includes("support")) return "faq";
  return "other";
}

function shouldSkip(url: string): boolean {
  return SKIP_PATH_PREFIXES.some((prefix) => url.includes(prefix));
}

function normalizeHref(href: string, baseUrl: string): string | null {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return null;
  }
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${baseUrl}${href.split("?")[0].split("#")[0]}`;
  if (href.startsWith(baseUrl)) return href.split("?")[0].split("#")[0];
  return null;
}

// ─── SITEMAP DISCOVERY ────────────────────────────────────────────────────────

async function discoverFromSitemap(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  const sitemapUrls = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const res = await axios.get(sitemapUrl, { timeout: REQUEST_TIMEOUT });
      const content = res.data as string;
      const $ = cheerio.load(content, { xmlMode: true });

      // Handle sitemap index (contains links to other sitemaps)
      const subSitemaps: string[] = [];
      $("sitemapindex sitemap loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (loc) subSitemaps.push(loc);
      });

      // Fetch sub-sitemaps (pages sitemap, articles sitemap, etc.)
      for (const sub of subSitemaps.slice(0, 5)) {
        try {
          const subRes = await axios.get(sub, { timeout: REQUEST_TIMEOUT });
          const $sub = cheerio.load(subRes.data, { xmlMode: true });
          $sub("url loc").each((_, el) => {
            const loc = $sub(el).text().trim();
            if (loc && loc.startsWith(baseUrl)) urls.push(loc.split("?")[0]);
          });
        } catch {}
      }

      // Also get direct URLs from this sitemap
      $("url loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (loc && loc.startsWith(baseUrl)) urls.push(loc.split("?")[0]);
      });

      if (urls.length > 0) break;
    } catch {}
  }

  return [...new Set(urls)];
}

// ─── NAV LINK DISCOVERY ───────────────────────────────────────────────────────

async function discoverFromNav(baseUrl: string): Promise<string[]> {
  const html = await fetchHtml(baseUrl);
  if (!html) return [];

  const $ = cheerio.load(html);
  const urls: string[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const normalized = normalizeHref(href, baseUrl);
    if (normalized && normalized.startsWith(baseUrl) && !shouldSkip(normalized)) {
      urls.push(normalized);
    }
  });

  return [...new Set(urls)];
}

// ─── MAIN CRAWLER ─────────────────────────────────────────────────────────────

/**
 * Crawls a Shopify store deeply — sitemap, all pages, policies, blog, FAQs, help center.
 * Calls onProgress with live updates for the UI checklist.
 * Returns an array of CrawledPage objects.
 */
export async function crawlShopifyStore(
  baseUrl: string,
  onProgress?: ProgressCallback
): Promise<CrawledPage[]> {
  const send = (p: CrawlProgress) => onProgress?.(p);
  const visited = new Set<string>();
  const pages: CrawledPage[] = [];

  // ── Step 1: Discover all URLs ──────────────────────────────────────────────
  send({ step: "sitemap", label: "Reading sitemap.xml..." });
  const sitemapUrls = await discoverFromSitemap(baseUrl);
  send({ step: "sitemap", label: `Sitemap: found ${sitemapUrls.length} pages`, done: true });

  send({ step: "nav", label: "Discovering navigation links..." });
  const navUrls = await discoverFromNav(baseUrl);
  send({ step: "nav", label: `Navigation: found ${navUrls.length} links`, done: true });

  // Merge & deduplicate
  const allUrls = [...new Set([...sitemapUrls, ...navUrls])].filter(
    (url) => url.startsWith(baseUrl) && !shouldSkip(url)
  );

  // Prioritize: pages > policies > FAQs > blogs > collections > other
  const priority = (url: string) => {
    const p = url.replace(baseUrl, "").toLowerCase();
    if (p.startsWith("/pages/")) return 0;
    if (p.startsWith("/policies/")) return 1;
    if (p.includes("faq") || p.includes("help")) return 2;
    if (p.startsWith("/blogs/") || p.startsWith("/blog/")) return 3;
    if (p.startsWith("/collections/")) return 4;
    return 5;
  };
  const prioritized = allUrls.sort((a, b) => priority(a) - priority(b));

  // ── Step 2: Crawl each page ────────────────────────────────────────────────
  const total = prioritized.length;
  let crawled = 0;

  // Categorize for UI progress labels
  const pageUrls = prioritized.filter((u) => u.includes("/pages/"));
  const policyUrls = prioritized.filter((u) => u.includes("/policies/"));
  const blogUrls = prioritized.filter(
    (u) => u.includes("/blogs/") || u.includes("/blog/")
  );
  const faqUrls = prioritized.filter(
    (u) => u.includes("faq") || u.includes("help")
  );

  send({ step: "pages", label: `Scraping ${pageUrls.length} store pages...` });
  send({ step: "policies", label: `Scraping ${policyUrls.length} policy pages...` });
  send({ step: "blog", label: `Scanning ${blogUrls.length} blog posts...` });
  send({ step: "faq", label: `Reading ${faqUrls.length} FAQ/help articles...` });

  for (const url of prioritized) {
    if (visited.has(url)) continue;
    visited.add(url);
    crawled++;

    const type = getPageType(url, baseUrl);
    const shortPath = url.replace(baseUrl, "") || "/";
    send({ step: "crawling", label: `Scraping ${shortPath}`, count: crawled, total });

    const html = await fetchHtml(url);
    if (!html) continue;

    const $ = cheerio.load(html);
    const title =
      $("h1").first().text().trim() ||
      $("title").text().split("|")[0].trim() ||
      shortPath;
    const content = extractCleanText(html);

    if (content.length > 80) {
      pages.push({ url, title, content, type });
    }
  }

  send({ step: "crawling", label: `Crawled ${pages.length} pages`, done: true });

  return pages;
}
