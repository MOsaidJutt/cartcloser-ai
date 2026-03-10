import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  try {
    const { openaiKey } = await req.json();

    if (!openaiKey || !openaiKey.startsWith("sk-")) {
      return Response.json({ error: "Invalid OpenAI API key format" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { openaiKey },
    });

    return Response.json({ message: "OpenAI key saved" });
  } catch (err) {
    console.error("[settings/openai]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
