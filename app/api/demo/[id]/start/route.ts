import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildOpeningMessage } from "@/lib/system-prompt";
import axios from "axios";

// ─── POST /api/demo/[id]/start — Visitor submits name, starts conversation ────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { visitorName } = await req.json();

    if (!visitorName?.trim()) {
      return Response.json({ error: "Visitor name is required" }, { status: 400 });
    }

    const agent = await prisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        storeName: true,
        storeUrl: true,
        botName: true,
        openingMessage: true,
        status: true,
      },
    });

    if (!agent) return Response.json({ error: "Demo not found" }, { status: 404 });
    if (agent.status !== "ready") {
      return Response.json({ error: "Demo not ready" }, { status: 503 });
    }

    // Fetch a real random product name directly from the store's products.json
    let featuredProduct = "your selected items";
    try {
      const res = await axios.get(`${agent.storeUrl}/products.json?limit=20`, { timeout: 8000 });
      const products: any[] = res.data?.products ?? [];
      if (products.length > 0) {
        const pick = products[Math.floor(Math.random() * products.length)];
        featuredProduct = pick.title ?? "your selected items";
      }
    } catch {
      // fall back to generic text
    }

    // Build personalized opening message
    const openingMessage = buildOpeningMessage(
      agent.openingMessage,
      visitorName.trim(),
      featuredProduct,
      agent.botName,
      agent.storeName
    );

    // Create conversation in DB + increment demo view counter (parallel)
    const [conversation] = await Promise.all([
      prisma.conversation.create({
        data: {
          agentId: id,
          visitorName: visitorName.trim(),
          productName: featuredProduct !== "your selected items" ? featuredProduct : null,
          messages: {
            create: {
              role: "assistant",
              content: openingMessage,
            },
          },
        },
      }),
      prisma.agent.update({
        where: { id },
        data: { demoViews: { increment: 1 } },
      }),
    ]);

    return Response.json({
      conversationId: conversation.id,
      openingMessage,
      botName: agent.botName,
    });
  } catch (err) {
    console.error("[demo/start]", err);
    return Response.json({ error: "Failed to start demo" }, { status: 500 });
  }
}
