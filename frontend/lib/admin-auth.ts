import "server-only";

import { timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";

const ADMIN_COOKIE = "admin_session";
const TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8h

export type AdminTokenPayload = {
  sub: string; // admin email
  scope: "admin";
  iat?: number;
  exp?: number;
};

export function adminCookieName() {
  return ADMIN_COOKIE;
}

export function adminTokenTtl() {
  return TOKEN_TTL_SECONDS;
}

function getJwtSecret(): string {
  const s = process.env.ADMIN_JWT_SECRET;
  if (!s) throw new Error("ADMIN_JWT_SECRET is not set");
  return s;
}

export function verifyCredentials(email: string, password: string): boolean {
  const expectedEmail = process.env.ADMIN_EMAIL || "";
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  if (!expectedEmail || !expectedPassword) return false;
  return constantTimeEq(email, expectedEmail) && constantTimeEq(password, expectedPassword);
}

export function issueAdminToken(email: string): string {
  return jwt.sign({ sub: email, scope: "admin" }, getJwtSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AdminTokenPayload;
    if (decoded.scope !== "admin") return null;
    return decoded;
  } catch {
    return null;
  }
}

function constantTimeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Pad to equal length to keep comparison constant-time-ish.
    const max = Math.max(ab.length, bb.length);
    const aPad = Buffer.alloc(max);
    const bPad = Buffer.alloc(max);
    ab.copy(aPad);
    bb.copy(bPad);
    timingSafeEqual(aPad, bPad);
    return false;
  }
  return timingSafeEqual(ab, bb);
}
