import { randomBytes, createHash } from "crypto";

/**
 * Public document tokens (Phase 3, ADR-0007; promoted to a shared security
 * module in Phase 5 when change orders adopted the same pattern as estimates).
 *
 * A high-entropy random token goes in the emailed URL; only its SHA-256 hash
 * is stored (e.g. `estimates.public_token_hash`, `change_orders.public_token_hash`).
 * Lookups are by hash equality on an indexed column — never by iterating rows.
 * This mirrors the invitation/password-reset token design (`tokens.ts`) but
 * uses 32 bytes of randomness (256 bits) because these links are longer-lived
 * and expose a financial document.
 */

const TOKEN_BYTES = 32; // 256 bits → 43-char base64url

export interface GeneratedToken {
  /** Plaintext — goes in the URL, emailed to the customer, never stored. */
  token: string;
  /** SHA-256 hex — the only representation persisted. */
  hash: string;
}

export function generatePublicToken(): GeneratedToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashPublicToken(token) };
}

export function hashPublicToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type TokenValidity =
  | { valid: true }
  | { valid: false; reason: "no_token" | "revoked" | "expired" };

/**
 * Pure validity check against the stored token metadata. Returning a coarse
 * reason for internal logging only — the public route must always surface a
 * single generic error to the customer regardless of which check failed
 * (no oracle for token state).
 */
export function checkTokenValidity(
  meta: { public_token_hash?: string | null; token_expires_at?: string | null; token_revoked_at?: string | null },
  now = new Date()
): TokenValidity {
  if (!meta.public_token_hash) return { valid: false, reason: "no_token" };
  if (meta.token_revoked_at) return { valid: false, reason: "revoked" };
  if (meta.token_expires_at && new Date(meta.token_expires_at).getTime() < now.getTime()) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true };
}
