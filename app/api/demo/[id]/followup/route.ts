import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

// If the last user message matches any of these, the conversation is over.
// Send nothing — don't spam someone who already said thanks.
const CONV_DONE_RE =
  /\b(thanks|thank you|thank u|thx|ty|great thanks|perfect thanks|sounds good|got it|all good|awesome thanks|cool thanks|nice thanks|appreciate it|appreciate that|cheers|that.?s all|that is all|that.?s helpful|that helps|makes sense|no thanks|not interested|maybe later|all set|i.?m good|im good|we.?re good|done|bye|goodbye|talk later|ttyl|ok great|okay great|no worries|you.?re welcome|np|no problem|got what i need|that.?s perfect|perfect)\b/i;

// ─── POST /api/demo/[id]/followup ────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { conversationId, followupNumber } = await req.json();

    if (!conversationId || followupNumber === undefined) {
      return Response.json({ error: "conversationId and followupNumber required" }, { status: 400 });
    }

    const num = Math.max(1, Math.min(3, followupNumber as number));

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: { systemPrompt: true, status: true, userId: true },
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

    // ── Server-side conversation-end guard ────────────────────────────────────
    // If the last thing the customer said was "thanks", "got it", "bye", etc.
    // do NOT send a follow-up — they're clearly done. Return a silent done event.
    const lastUserMsg = [...conversation.messages]
      .reverse()
      .find((m) => m.role === "user")?.content ?? "";

    if (CONV_DONE_RE.test(lastUserMsg)) {
      const encoder = new TextEncoder();
      const silent = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        },
      });
      return new Response(silent, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: agent.userId },
      select: { openaiKey: true },
    });
    const apiKey = user?.openaiKey ?? process.env.OPENAI_API_KEY ?? "";
    const client = new OpenAI({ apiKey });

    // Last 10 messages only — follow-ups only need recent context
    const history: OpenAI.Chat.ChatCompletionMessageParam[] = conversation.messages.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Extract last assistant message to avoid repeating it
    const lastBotMsg = [...conversation.messages]
      .reverse()
      .find((m) => m.role === "assistant")?.content ?? "";

    // Each follow-up takes a genuinely different approach
    const approaches: Record<number, string> = {
      1: `The customer went quiet. Send a single short, natural follow-up SMS — one sentence only. Check in warmly without pressure. Do NOT mention products or discounts yet.`,
      2: `The customer still hasn't replied. Send one sentence — a different angle from your last message. You could mention an easy next step, a key benefit, or gently address a common hesitation. Keep it human and brief.`,
      3: `Last follow-up. One sentence, warm sign-off tone. Let them know you're here if they need anything. No pressure at all.`,
    };

    const avoidRepeat = lastBotMsg
      ? `\n\nIMPORTANT: Your last message was: "${lastBotMsg.slice(0, 180)}"\nDo NOT repeat or paraphrase any part of that. Say something genuinely different.`
      : "";

    const instruction =
      `FOLLOW-UP INSTRUCTION: ${approaches[num]}${avoidRepeat}\n\nRules: One sentence. Plain SMS text. No markdown. Sound like a real person texting.`;

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {}
        };

        try {
          // Natural pause before follow-up appears (person picking up phone feel)
          await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

          // Truncate system prompt to stay well under TPM limits
          const MAX_SYSTEM_CHARS = 20000;
          const truncatedPrompt = agent.systemPrompt.length > MAX_SYSTEM_CHARS
            ? agent.systemPrompt.slice(0, MAX_SYSTEM_CHARS) + "\n[...truncated]"
            : agent.systemPrompt;

          const response = await client.chat.completions.create({
            model: "gpt-4o-mini", // 200K TPM — safe even for large knowledge bases
            messages: [
              {
                role: "system",
                content: truncatedPrompt + "\n\n" + instruction,
              },
              ...history,
            ],
            max_tokens: 80,   // hard cap — 1 sentence only
            temperature: 0.95,
          });

          const content = (response.choices[0]?.message?.content ?? "").trim();

          // Stream character-by-character — same timing as chat
          for (const char of content) {
            send({ delta: char });
            const isPunct = [".", "!", "?"].includes(char);
            const isComma = [",", ";"].includes(char);
            const isSpace = char === " ";
            const ms = isPunct
              ? 120 + Math.random() * 80
              : isComma
              ? 50 + Math.random() * 30
              : isSpace
              ? 18 + Math.random() * 12
              : 12 + Math.random() * 8;
            await new Promise((r) => setTimeout(r, ms));
          }

          await prisma.message.create({
            data: { conversationId, role: "assistant", content },
          });

          send({ done: true });
        } catch (err) {
          console.error("[demo/followup]", err);
          send({ error: "Failed to generate follow-up" });
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
    console.error("[demo/followup]", err);
    return Response.json({ error: "Failed to process follow-up" }, { status: 500 });
  }
}
