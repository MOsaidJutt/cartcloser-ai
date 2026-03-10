import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me";
const SALT_ROUNDS = 12;

// ─── PASSWORD ─────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

// ─── REQUEST HELPERS ──────────────────────────────────────────────────────────

/**
 * Extracts the JWT from the Authorization header or the `token` cookie.
 * Returns the decoded payload or null if invalid/missing.
 */
export function getSessionUser(req: NextRequest): JWTPayload | null {
  // Try Authorization: Bearer <token>
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyToken(authHeader.slice(7));
  }

  // Try cookie
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) {
    return verifyToken(cookieToken);
  }

  return null;
}

/**
 * Returns an unauthorized JSON response.
 */
export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
