import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { password } = await req.json();
  const expected = process.env.CHAT_VIEW_PASSWORD;

  if (!expected) {
    return Response.json({ error: "Not configured" }, { status: 500 });
  }

  return Response.json({ ok: password === expected });
}
