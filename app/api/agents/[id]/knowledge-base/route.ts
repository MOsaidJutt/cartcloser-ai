import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/system-prompt";
import axios from "axios";
import * as cheerio from "cheerio";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function parseKbSections(raw: string): { heading: string; content: string }[] {
  const sections: { heading: string; content: string }[] = [];
  const parts = raw.split(/^##\s+/m).filter(Boolean);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    if (newline === -1) continue;
    const heading = part.slice(0, newline).trim();
    const content = part.slice(newline + 1).trim();
    if (heading && content) sections.push({ heading, content });
  }
  if (sections.length === 0 && raw.trim()) {
    sections.push({ heading: "Knowledge Base", content: raw.trim() });
  }
  return sections;
}

function rebuildKb(sections: { heading: string; content: string }[]): string {
  return sections.map((s) => `## ${s.heading}\n\n${s.content}`).join("\n\n---\n\n");
}

// ─── GET /api/agents/[id]/knowledge-base ─────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id, userId: session.userId },
    select: { knowledgeBase: true, storeName: true, productCount: true },
  });

  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const raw = agent.knowledgeBase ?? "";
  const sections = parseKbSections(raw);

  return Response.json({
    storeName: agent.storeName,
    productCount: agent.productCount,
    characterCount: raw.length,
    sections,
  });
}

// ─── PATCH /api/agents/[id]/knowledge-base ────────────────────────────────────
// Two modes:
//   { type: "update-section", sectionHeading, content } — edit a section
//   { type: "fetch-page", url }                         — fetch a URL and append its content

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { id } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id, userId: session.userId },
  });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  const body = await req.json();
  const { type } = body;

  let newKb = agent.knowledgeBase ?? "";

  if (type === "update-section") {
    const { sectionHeading, content } = body as {
      sectionHeading: string;
      content: string;
    };
    if (!sectionHeading || content === undefined) {
      return Response.json({ error: "sectionHeading and content required" }, { status: 400 });
    }

    const sections = parseKbSections(newKb);
    const idx = sections.findIndex((s) => s.heading === sectionHeading);
    if (idx === -1) {
      // Add as new section
      sections.push({ heading: sectionHeading, content });
    } else {
      sections[idx] = { heading: sectionHeading, content };
    }
    newKb = rebuildKb(sections);

  } else if (type === "fetch-page") {
    const { url } = body as { url: string };
    if (!url) return Response.json({ error: "url required" }, { status: 400 });

    // Security: only allow fetching from the agent's store domain
    const storeHost = agent.storeUrl.replace(/^https?:\/\//, "").split("/")[0];
    const reqHost = url.replace(/^https?:\/\//, "").split("/")[0];
    if (reqHost !== storeHost) {
      return Response.json(
        { error: "URL must be on the store's domain" },
        { status: 400 }
      );
    }

    try {
      const res = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        maxRedirects: 3,
      });
      const html = typeof res.data === "string" ? res.data : "";
      const $ = cheerio.load(html);
      $("script, style, noscript, nav, footer, header, iframe").remove();
      const text =
        $("main").text() ||
        $("article").text() ||
        $(".page-content, .shopify-policy__body, .rte, #content, .content").text() ||
        $("body").text();
      const pageContent = text.replace(/\s+/g, " ").trim().slice(0, 5000);
      const pageTitle =
        $("h1").first().text().trim() || $("title").text().split("|")[0].trim() || url;

      // Return just the content for the client to preview; not yet saved
      return Response.json({ preview: pageContent, title: pageTitle });
    } catch {
      return Response.json({ error: "Failed to fetch page" }, { status: 502 });
    }

  } else if (type === "append-section") {
    // Append a new section (after user reviewed fetch-page preview)
    const { sectionHeading, content } = body as {
      sectionHeading: string;
      content: string;
    };
    if (!sectionHeading || !content) {
      return Response.json({ error: "sectionHeading and content required" }, { status: 400 });
    }

    const sections = parseKbSections(newKb);
    const existing = sections.findIndex((s) => s.heading === sectionHeading);
    if (existing !== -1) {
      // Append to existing section
      sections[existing].content += "\n\n" + content;
    } else {
      sections.push({ heading: sectionHeading, content });
    }
    newKb = rebuildKb(sections);

  } else {
    return Response.json({ error: "Invalid type" }, { status: 400 });
  }

  // For update-section and append-section: save to DB and rebuild system prompt
  const newSystemPrompt = buildSystemPrompt({
    botName: agent.botName,
    storeName: agent.storeName,
    storeUrl: agent.storeUrl,
    knowledgeBase: newKb,
    couponCode: agent.couponCode,
    couponDiscount: agent.couponDiscount,
    tone: agent.tone ?? "casual",
  });

  await prisma.agent.update({
    where: { id },
    data: { knowledgeBase: newKb, systemPrompt: newSystemPrompt },
  });

  const sections = parseKbSections(newKb);
  return Response.json({
    characterCount: newKb.length,
    sections,
  });
}
