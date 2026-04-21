import { NextRequest } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// XOR-based obfuscation for API key storage
function obfuscate(text: string): string {
  const key = process.env.JWT_SECRET ?? "dev-secret";
  return Buffer.from(
    text.split("").map((c, i) => c.charCodeAt(0) ^ key.charCodeAt(i % key.length)).join(",")
  ).toString("base64");
}

export function deobfuscate(encoded: string): string {
  const key = process.env.JWT_SECRET ?? "dev-secret";
  const nums = Buffer.from(encoded, "base64").toString().split(",").map(Number);
  return nums.map((n, i) => String.fromCharCode(n ^ key.charCodeAt(i % key.length))).join("");
}

// ─── GET — return GHL connection status ──────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return unauthorized();

  const hasGhl = !!(user as any).ghlApiToken;
  return Response.json({ connected: hasGhl });
}

// ─── PUT — save & validate GHL API token only ────────────────────────────────

export async function PUT(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { ghlApiToken } = await req.json();

  if (!ghlApiToken?.trim()) {
    return Response.json({ error: "API token is required" }, { status: 400 });
  }

  // Validate the token by calling GHL API
  try {
    const testRes = await fetch("https://services.leadconnectorhq.com/oauth/userinfo", {
      headers: {
        Authorization: `Bearer ${ghlApiToken.trim()}`,
        Version: "2021-07-28",
      },
    });

    if (!testRes.ok) {
      return Response.json(
        { error: "Invalid GHL API token — could not authenticate" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: { ghlApiToken: obfuscate(ghlApiToken.trim()) } as any,
    });

    return Response.json({ connected: true });
  } catch {
    return Response.json(
      { error: "Failed to connect to GHL — check your API token" },
      { status: 400 }
    );
  }
}

// ─── DELETE — disconnect GHL ─────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  await prisma.user.update({
    where: { id: session.userId },
    data: { ghlApiToken: null, ghlLocationId: null } as any,
  });

  return Response.json({ connected: false });
}

// ── Helper: get decrypted GHL token for a user ───────────────────────────────
// locationId is now sourced from the Agent model, not User.

export async function getGhlToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!(user as any)?.ghlApiToken) return null;
  return deobfuscate((user as any).ghlApiToken);
}
