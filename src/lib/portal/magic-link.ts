import { db } from "@/lib/db/client";
import { generatePublicToken, hashPublicToken } from "@/lib/security/public-document-token";
import type { PortalMagicLinkPurpose } from "@/types/portal";

/**
 * Passwordless magic-link tokens (Phase 7, ADR-0014). 256-bit random token
 * emailed to the customer; only its SHA-256 hash is stored. One-time
 * (consumed_at), short-lived (expiry), and consuming is an atomic claim so a
 * replayed link can never log in twice.
 */

const LOGIN_TTL_MINUTES = 20;
const INVITE_TTL_HOURS = 72;

export interface CreatedMagicLink {
  token: string; // raw — goes in the emailed URL, never stored
  expiresAt: string;
}

export async function createMagicLink(
  portalCustomerId: string,
  tenantId: string,
  purpose: PortalMagicLinkPurpose,
  requestedIp?: string | null
): Promise<CreatedMagicLink> {
  const { token, hash } = generatePublicToken();
  const ttlMs = purpose === "invite" ? INVITE_TTL_HOURS * 60 * 60 * 1000 : LOGIN_TTL_MINUTES * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const { error } = await db.from("portal_magic_links").insert({
    portal_customer_id: portalCustomerId,
    tenant_id: tenantId,
    token_hash: hash,
    purpose,
    expires_at: expiresAt,
    requested_ip: requestedIp ?? null,
  });
  if (error) throw new Error(`[portal] createMagicLink: ${error.message}`);
  return { token, expiresAt };
}

export type ConsumeResult =
  | { ok: true; portalCustomerId: string; tenantId: string }
  | { ok: false };

interface LinkRow {
  id: string;
  portal_customer_id: string;
  tenant_id: string;
  expires_at: string;
  consumed_at: string | null;
}

/**
 * Atomically consumes a magic-link token. The UPDATE ... WHERE consumed_at IS
 * NULL claim means exactly one concurrent request can win; a replay of an
 * already-consumed or expired link returns { ok: false } with no side effect.
 * Any failure returns the same generic result — no oracle.
 */
export async function consumeMagicLink(rawToken: string): Promise<ConsumeResult> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return { ok: false };
  const hash = hashPublicToken(rawToken);

  const { data: linkData } = await db
    .from("portal_magic_links")
    .select("id, portal_customer_id, tenant_id, expires_at, consumed_at")
    .eq("token_hash", hash)
    .maybeSingle();
  const link = linkData as LinkRow | null;
  if (!link) return { ok: false };
  if (link.consumed_at) return { ok: false };
  if (new Date(link.expires_at).getTime() < Date.now()) return { ok: false };

  // Atomic claim: only one caller can flip consumed_at from NULL.
  const { data: claimed, error } = await db
    .from("portal_magic_links")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", link.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (error || !claimed) return { ok: false };

  return { ok: true, portalCustomerId: link.portal_customer_id, tenantId: link.tenant_id };
}
