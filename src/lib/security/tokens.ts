/**
 * Token generation/hashing for invitation and password-reset links.
 *
 * Tokens are random values the caller emails to the user; only the SHA-256
 * hash is ever persisted (security-audit M11 — the invitation token was
 * previously stored and compared in plaintext).
 */

import { randomUUID, createHash, timingSafeEqual } from "crypto";

/** Generates a new opaque token to embed in an emailed link. */
export function generateToken(): string {
  return randomUUID();
}

/** One-way hash of a token for storage/lookup. Lookups are by hash equality (indexed), not by iterating and timing-safe-comparing every row. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison — used only where two hashes are compared in application code rather than via an indexed DB lookup. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
