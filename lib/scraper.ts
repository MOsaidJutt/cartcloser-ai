import axios from "axios";
import * as cheerio from "cheerio";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface ScrapedProduct {
  id: number;
  title: string;
  description: string;
  price: string;
  compareAtPrice: string | null;
  onSale: boolean;
  available: boolean; // true if at least one variant is in stock
  imageUrl: string | null;
  productUrl: string;
  checkoutUrl: string; // direct Shopify add-to-cart/checkout link
  productType: string;
  tags: string[];
  variants: { id: number; title: string; price: string; available: boolean }[];
}

export interface ScrapedPolicies {
  shipping: string | null;
  refund: string | null;
  terms: string | null;
}

export interface ScrapedStore {
  storeName: string;
  storeDescription: string | null;
  storeUrl: string;
  products: ScrapedProduct[];
  policies: ScrapedPolicies;
  productCount: number;
  saleProductCount: number;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, " ").trim();
}

function normalizeUrl(url: string): string {
  url = url.trim();
  if (!url.startsWith("http")) url = "https://" + url;
  return url.replace(/\/$/, "");
}

// ─── SCRAPE PRODUCTS ──────────────────────────────────────────────────────────

async function scrapeProducts(baseUrl: string): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  let page = 1;
  const limit = 250;

  while (true) {
    const url = `${baseUrl}/products.json?limit=${limit}&page=${page}`;
    const res = await axios.get(url, { timeout: 15000 });
    const batch: any[] = res.data?.products ?? [];

    if (batch.length === 0) break;

    for (const p of batch) {
      const firstVariant = p.variants?.[0];
      const price = firstVariant?.price ?? "0";
      const compareAtPrice = firstVariant?.compare_at_price ?? null;
      const onSale = compareAtPrice !== null && parseFloat(compareAtPrice) > parseFloat(price);

      const firstVariantId = firstVariant?.id ?? null;
      const variants = (p.variants ?? []).map((v: any) => ({
        id: v.id,
        title: v.title,
        price: v.price,
        available: v.available !== false, // Shopify sets false when OOS
      }));
      const available = variants.some((v: { available: boolean }) => v.available);

      products.push({
        id: p.id,
        title: p.title ?? "",
        description: stripHtml(p.body_html ?? ""),
        price,
        compareAtPrice,
        onSale,
        available,
        imageUrl: p.images?.[0]?.src ?? null,
        productUrl: `${baseUrl}/products/${p.handle}`,
        checkoutUrl: firstVariantId
          ? `${baseUrl}/cart/${firstVariantId}:1`
          : `${baseUrl}/products/${p.handle}`,
        productType: p.product_type ?? "",
        tags: p.tags ? (typeof p.tags === "string" ? p.tags.split(", ") : p.tags) : [],
        variants,
      });
    }

    if (batch.length < limit) break;
    page++;
  }

  return products;
}

// ─── SCRAPE POLICIES ──────────────────────────────────────────────────────────

async function scrapePolicy(baseUrl: string, slug: string): Promise<string | null> {
  try {
    const res = await axios.get(`${baseUrl}/policies/${slug}`, { timeout: 10000 });
    const $ = cheerio.load(res.data);
    // Shopify policy pages usually have content in .policy or article
    const text =
      $(".policy__title ~ *").text() ||
      $("article").text() ||
      $(".rte").text() ||
      $("main").text();
    return text.replace(/\s+/g, " ").trim().slice(0, 3000) || null;
  } catch {
    return null;
  }
}

async function scrapePolicies(baseUrl: string): Promise<ScrapedPolicies> {
  const [shipping, refund, terms] = await Promise.all([
    scrapePolicy(baseUrl, "shipping-policy"),
    scrapePolicy(baseUrl, "refund-policy"),
    scrapePolicy(baseUrl, "terms-of-service"),
  ]);
  return { shipping, refund, terms };
}

// ─── SCRAPE STORE META ────────────────────────────────────────────────────────

async function scrapeStoreMeta(
  baseUrl: string
): Promise<{ storeName: string; storeDescription: string | null }> {
  try {
    const res = await axios.get(`${baseUrl}/meta.json`, { timeout: 10000 });
    return {
      storeName: res.data?.name ?? new URL(baseUrl).hostname,
      storeDescription: res.data?.description ?? null,
    };
  } catch {
    // Fall back to parsing <title> from home page
    try {
      const res = await axios.get(baseUrl, { timeout: 10000 });
      const $ = cheerio.load(res.data);
      const title = $("title").text().split("|")[0].trim();
      return { storeName: title || new URL(baseUrl).hostname, storeDescription: null };
    } catch {
      return { storeName: new URL(baseUrl).hostname, storeDescription: null };
    }
  }
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

/**
 * Scrapes a Shopify store and returns structured data.
 * Throws if products.json is inaccessible (not a Shopify store or URL invalid).
 */
export async function scrapeShopifyStore(rawUrl: string): Promise<ScrapedStore> {
  const baseUrl = normalizeUrl(rawUrl);

  // Validate it's a Shopify store by hitting products.json
  let firstPageProducts: any[];
  try {
    const res = await axios.get(`${baseUrl}/products.json?limit=1`, { timeout: 15000 });
    firstPageProducts = res.data?.products;
    if (!Array.isArray(firstPageProducts)) throw new Error("Not a Shopify store");
  } catch (err: any) {
    throw new Error(
      `Could not access ${baseUrl}/products.json — is this a valid Shopify store? (${err.message})`
    );
  }

  const [products, policies, meta] = await Promise.all([
    scrapeProducts(baseUrl),
    scrapePolicies(baseUrl),
    scrapeStoreMeta(baseUrl),
  ]);

  const saleProductCount = products.filter((p) => p.onSale).length;

  return {
    storeName: meta.storeName,
    storeDescription: meta.storeDescription,
    storeUrl: baseUrl,
    products,
    policies,
    productCount: products.length,
    saleProductCount,
  };
}

/**
 * Quick product count check without full scrape — used for URL validation in UI.
 */
export async function quickProductCount(rawUrl: string): Promise<number> {
  const baseUrl = normalizeUrl(rawUrl);
  const res = await axios.get(`${baseUrl}/products.json?limit=1`, { timeout: 10000 });
  // Shopify doesn't return total in products.json easily, so fetch page 1 to check existence
  // Return -1 if not accessible, else we'll do a full count call
  const products: any[] = res.data?.products ?? [];
  if (!Array.isArray(products)) return 0;
  // Get a rough count by checking how many we get with limit=250
  const res2 = await axios.get(`${baseUrl}/products.json?limit=250`, { timeout: 15000 });
  return (res2.data?.products ?? []).length;
}
