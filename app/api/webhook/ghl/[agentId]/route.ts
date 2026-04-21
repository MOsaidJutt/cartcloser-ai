import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import OpenAI from "openai";
// ── Catalog link helpers (duplicated here to avoid circular deps) ─────────────

interface CatalogEntry { label: string; url: string }

function parseCatalogLinks(systemPrompt: string): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const lines = systemPrompt.split("\n");
  let currentProduct = "";
  for (const line of lines) {
    const singleMatch = line.match(/^- (.+?)(?:\s*\[.*?])?\s*:.*?\|\s*checkout:\s*(https?:\/\/\S+)/);
    if (singleMatch) { currentProduct = singleMatch[1].trim(); entries.push({ label: currentProduct.toLowerCase(), url: singleMatch[2] }); continue; }
    const headerMatch = line.match(/^- (.+?)(?:\s*\[.*?])?\s*:/);
    if (headerMatch) { currentProduct = headerMatch[1].trim(); continue; }
    const variantMatch = line.match(/^\s+•\s+(.+?)\s+—.*?\|\s*checkout:\s*(https?:\/\/\S+)/);
    if (variantMatch && currentProduct) {
      const vn = variantMatch[1].trim();
      entries.push({ label: `${currentProduct} ${vn}`.toLowerCase(), url: variantMatch[2] });
      entries.push({ label: vn.toLowerCase(), url: variantMatch[2] });
    }
  }
  return entries;
}

function findBestCheckoutUrl(recentText: string, entries: CatalogEntry[]): string | null {
  const text = recentText.toLowerCase();
  let bestEntry: CatalogEntry | null = null;
  let bestScore = 0;
  for (const entry of entries) {
    const words = entry.label.split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) continue;
    const score = words.filter((w) => text.includes(w)).length / words.length;
    if (score > bestScore) { bestScore = score; bestEntry = entry; }
  }
  return bestScore >= 0.5 ? bestEntry!.url : null;
}
import { checkRestrictedTopic } from "@/lib/config-guard";
import type { AgentConfig } from "@/lib/system-prompt";

export const maxDuration = 60;

// ── Verify GHL webhook HMAC signature ────────────────────────────────────────
function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Send SMS reply back via GHL Conversations API ────────────────────────────
async function sendGhlReply(
  token: string,
  conversationId: string,
  message: string
): Promise<boolean> {
  try {
    const res = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-04-15",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "SMS",
        conversationId,
        message,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Get or create conversation by GHL contact ID ─────────────────────────────
async function getOrCreateConversation(agentId: string, ghlContactId: string, visitorName: string) {
  // Try find existing conversation for this contact
  const existing = await (prisma as any).conversation.findFirst({
    where: { agentId, ghlContactId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (existing) return existing;

  // Create new conversation
  return (prisma as any).conversation.create({
    data: {
      agentId,
      ghlContactId,
      visitorName: visitorName || "Customer",
      productName: null,
    },
    include: { messages: [] },
  });
}

// ─── POST — receive inbound SMS from GHL ─────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const rawBody = await req.text();

  // Load agent
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

  // Verify HMAC signature if secret is set
  const webhookSecret = (agent as any).ghlWebhookSecret;
  if (webhookSecret) {
    const signature = req.headers.get("x-ghl-signature") ?? "";
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      console.warn(`[webhook/ghl] Invalid signature for agent ${agentId}`);
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract fields from GHL webhook payload
  const inboundMessage: string = payload?.body ?? payload?.message ?? payload?.text ?? "";
  const ghlContactId: string  = payload?.contactId ?? payload?.contact_id ?? "";
  const ghlConversationId: string = payload?.conversationId ?? payload?.conversation_id ?? "";
  const contactName: string   = payload?.firstName ?? payload?.contact?.firstName ?? "Customer";

  if (!inboundMessage.trim()) {
    return Response.json({ ok: true, note: "Empty message — ignored" });
  }

  // Get or create conversation
  const conversation = await getOrCreateConversation(agentId, ghlContactId, contactName);

  // Save inbound message
  await (prisma as any).message.create({
    data: {
      conversationId: conversation.id,
      role: "user",
      content: inboundMessage,
    },
  });

  // Build conversation history for AI (last 10 messages)
  const allMessages = [
    ...(conversation.messages ?? []),
    { role: "user", content: inboundMessage },
  ].slice(-10);

  const history: OpenAI.Chat.ChatCompletionMessageParam[] = allMessages.map(
    (m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })
  );

  // ── Server-side restricted topic guard ───────────────────────────────────────
  const agentConfig: AgentConfig = (() => {
    try { return JSON.parse((agent as any).config ?? "{}"); } catch { return {}; }
  })();

  const blockedReply = checkRestrictedTopic(inboundMessage, agentConfig);
  if (blockedReply) {
    await (prisma as any).message.create({
      data: { conversationId: conversation.id, role: "assistant", content: blockedReply },
    });
    if (ghlConversationId) {
      const user2 = await prisma.user.findUnique({ where: { id: agent.userId } });
      const ghlToken2 = (user2 as any)?.ghlApiToken;
      if (ghlToken2) {
        const { deobfuscate } = await import("@/app/api/settings/ghl/route");
        const tok = deobfuscate(ghlToken2);
        await sendGhlReply(tok, ghlConversationId, blockedReply);
      }
    }
    return Response.json({ ok: true, note: "Restricted topic — canned reply sent" });
  }

  // Build system prompt — inject checkout URL if customer wants a link
  let systemPrompt = agent.systemPrompt;
  const wantsLink = /\b(link|url|buy|purchase|order|checkout|get it|send|give|yes|ok|okay|sure|please|now)\b/i.test(inboundMessage);
  if (wantsLink) {
    const catalogEntries = parseCatalogLinks(agent.systemPrompt);
    const recentText = allMessages.slice(-4).map((m: { content: string }) => m.content).join(" ");
    const correctUrl = findBestCheckoutUrl(recentText, catalogEntries);
    if (correctUrl) {
      systemPrompt += `\n\n---\nCHECKOUT URL INSTRUCTION: The customer wants to purchase now. Send them this exact URL: ${correctUrl}\nYour response MUST include: "Here you go: ${correctUrl}"\n---`;
    }
  }

  // Generate AI reply
  const apiKey = (await prisma.user.findUnique({ where: { id: agent.userId } }))?.openaiKey ?? process.env.OPENAI_API_KEY ?? "";
  const client = new OpenAI({ apiKey });

  let aiReply = "";
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...history],
      max_tokens: 300,
      temperature: 0.85,
    });
    aiReply = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[webhook/ghl] OpenAI error:", err);
    return Response.json({ ok: true, note: "AI generation failed" });
  }

  if (!aiReply) return Response.json({ ok: true, note: "Empty AI reply" });

  // Save AI reply to conversation
  await (prisma as any).message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: aiReply,
    },
  });

  // Send reply back via GHL using agent's locationId (per-client sub-account)
  if (ghlConversationId) {
    const user = await prisma.user.findUnique({ where: { id: agent.userId } });
    const ghlToken = (user as any)?.ghlApiToken;

    if (ghlToken) {
      const { deobfuscate } = await import("@/app/api/settings/ghl/route");
      const token = deobfuscate(ghlToken);
      const sent = await sendGhlReply(token, ghlConversationId, aiReply);
      if (!sent) console.warn("[webhook/ghl] Failed to send GHL reply");
    }
  }

  // Log which sub-account handled this message
  const agentLocationId = (agent as any).ghlLocationId;
  if (agentLocationId) {
    console.log(`[webhook/ghl] Handled by location: ${agentLocationId}`);
  }

  return Response.json({ ok: true });
}
