import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import axios from "axios";

// ─── GET /api/demo/[id] — Public agent data (no auth required) ────────────────
// Returns only safe fields — never exposes systemPrompt or full knowledgeBase.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const agent = await prisma.agent.findUnique({
    where: { id },
    select: {
      id: true,
      storeName: true,
      storeUrl: true,
      storeLogo: true,
      botName: true,
      openingMessage: true,
      currency: true,
      productCount: true,
      status: true,
      // Pick a random product for the opening message — we fetch conversations to get count
      conversations: {
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!agent) {
    return Response.json({ error: "Demo not found" }, { status: 404 });
  }

  if (agent.status !== "ready") {
    return Response.json({ error: "This demo is not ready yet" }, { status: 503 });
  }

  // Fetch a real random product name directly from the store's products.json
  let randomProduct = "your selected items";
  try {
    const res = await axios.get(`${agent.storeUrl}/products.json?limit=20`, { timeout: 8000 });
    const products: any[] = res.data?.products ?? [];
    if (products.length > 0) {
      const pick = products[Math.floor(Math.random() * products.length)];
      randomProduct = pick.title ?? "your selected items";
    }
  } catch {
    // fall back to generic text
  }

  return Response.json({
    agent: {
      id: agent.id,
      storeName: agent.storeName,
      storeUrl: agent.storeUrl,
      storeLogo: agent.storeLogo,
      botName: agent.botName,
      openingMessageTemplate: agent.openingMessage,
      currency: agent.currency,
      productCount: agent.productCount,
    },
    featuredProduct: randomProduct,
  });
}
