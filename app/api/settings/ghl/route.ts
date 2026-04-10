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

  const hasGhl = !!(user as any).ghlApiToken && !!(user as any).ghlLocationId;
  return Response.json({
    connected: hasGhl,
    locationId: hasGhl ? (user as any).ghlLocationId : null,
  });
}

// ─── PUT — save & validate GHL credentials ───────────────────────────────────

export async function PUT(req: NextRequest) {
  const session = getSessionUser(req);
  if (!session) return unauthorized();

  const { ghlApiToken, ghlLocationId } = await req.json();

  if (!ghlApiToken?.trim() || !ghlLocationId?.trim()) {
    return Response.json({ error: "API token and Location ID are required" }, { status: 400 });
  }

  try {
    const testRes = await fetch(
      `https://services.leadconnectorhq.com/locations/${ghlLocationId.trim()}`,
      {
        headers: {
          Authorization: `Bearer ${ghlApiToken.trim()}`,
          Version: "2021-07-28",
        },
      }
    );

    if (!testRes.ok) {
      return Response.json(
        { error: "Invalid GHL credentials — could not connect to your account" },
        { status: 400 }
      );
    }

    const locationData = await testRes.json();
    const locationName = locationData?.name ?? locationData?.location?.name ?? "Connected";

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        ghlApiToken:   obfuscate(ghlApiToken.trim()),
        ghlLocationId: ghlLocationId.trim(),
      } as any,
    });

    return Response.json({ connected: true, locationId: ghlLocationId.trim(), locationName });
  } catch {
    return Response.json(
      { error: "Failed to connect to GHL — check your API token and Location ID" },
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

// ── Helper exported for use by webhook + reply sender routes ─────────────────

export async function getGhlToken(
  userId: string
): Promise<{ token: string; locationId: string } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!(user as any)?.ghlApiToken || !(user as any)?.ghlLocationId) return null;
  return {
    token:      deobfuscate((user as any).ghlApiToken),
    locationId: (user as any).ghlLocationId,
  };
}
