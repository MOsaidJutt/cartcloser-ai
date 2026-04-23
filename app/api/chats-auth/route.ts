import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const correct = process.env.CHAT_VIEW_PASSWORD;

  if (!correct) {
    return Response.json({ error: "CHAT_VIEW_PASSWORD not configured" }, { status: 500 });
  }

  if (password === correct) {
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false }, { status: 401 });
}
