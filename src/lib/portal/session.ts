import { db } from "@/lib/db/client";
import { hashPublicToken, generatePublicToken } from "@/lib/security/public-document-token";
import type { PortalContext } from "@/types/portal";

/**
 * Portal session model (Phase 7, ADR-0014).
 *
 * Sessions are opaque bearer tokens (256-bit random), hashed at rest in
 * `portal_sessions`, carried in an HttpOnly `portal_session` cookie. Every
 * portal request re-validates against the DB (session not revoked/expired,
 * customer active, session_version still matching) — the same trusted-context
 * discipline as the staff session, so a revoked or deactivated portal customer
 * loses access immediately, not at token expiry.
 *
 * We use DB-backed sessions rather than a stateless JWT specifically because
 * per-session revocation ("sign out this device") and access history are
 * first-class portal requirements.
 */

export const PORTAL_COOKIE = "portal_session";
const SESSION_DAYS = 30;

export interface IssuedSession {
  token: string;      // raw — goes in the cookie, never stored
  sessionId: string;
  expiresAt: string;
}

export async function issuePortalSession(
  portalCustomerId: string,
  tenantId: string,
  sessionVersion: number,
  meta: { ip?: string | null; userAgent?: string | null }
): Promise<IssuedSession> {
  const { token, hash } = generatePublicToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("portal_sessions")
    .insert({
      portal_customer_id: portalCustomerId,
      tenant_id: tenantId,
      token_hash: hash,
      session_version: sessionVersion,
      expires_at: expiresAt,
      last_seen_at: new Date().toISOString(),
      ip: meta.ip ?? null,
      user_agent: meta.userAgent ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(`[portal] issuePortalSession: ${error.message}`);
  return { token, sessionId: (data as { id: string }).id, expiresAt };
}

interface SessionRow {
  id: string;
  portal_customer_id: string;
  tenant_id: string;
  session_version: number;
  expires_at: string;
  revoked_at: string | null;
}
interface CustomerRow {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  is_active: boolean;
  session_version: number;
}

/**
 * Resolves a raw session token to a trusted PortalContext, or null if the
 * session is invalid for ANY reason (unknown / expired / revoked / customer
 * deactivated / session_version bumped). No oracle — callers surface a single
 * generic 401.
 */
export async function resolvePortalSession(rawToken: string | undefined | null): Promise<PortalContext | null> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return null;
  const hash = hashPublicToken(rawToken);

  const { data: sessionData } = await db
    .from("portal_sessions")
    .select("id, portal_customer_id, tenant_id, session_version, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  const session = sessionData as SessionRow | null;
  if (!session) return null;
  if (session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  const { data: customerData } = await db
    .from("portal_customers")
    .select("id, tenant_id, email, name, is_active, session_version")
    .eq("id", session.portal_customer_id)
    .eq("tenant_id", session.tenant_id)
    .maybeSingle();
  const customer = customerData as CustomerRow | null;
  if (!customer || !customer.is_active) return null;
  // A bumped session_version revokes every session issued before the bump.
  if (customer.session_version !== session.session_version) return null;

  const { data: props } = await db
    .from("portal_customer_properties")
    .select("property_id")
    .eq("portal_customer_id", customer.id)
    .eq("tenant_id", customer.tenant_id);
  const propertyIds = ((props ?? []) as { property_id: string }[]).map((p) => p.property_id);

  // Best-effort last-seen touch (never fatal).
  void db.from("portal_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);

  return {
    portalCustomerId: customer.id,
    tenantId: customer.tenant_id,
    sessionId: session.id,
    email: customer.email,
    name: customer.name,
    propertyIds,
  };
}

export async function revokePortalSession(sessionId: string, tenantId: string): Promise<void> {
  await db
    .from("portal_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .is("revoked_at", null);
}

/** Revokes ALL of a customer's sessions by bumping session_version. */
export async function revokeAllPortalSessions(portalCustomerId: string, tenantId: string): Promise<void> {
  const { data } = await db
    .from("portal_customers")
    .select("session_version")
    .eq("id", portalCustomerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const current = (data as { session_version: number } | null)?.session_version ?? 1;
  await db
    .from("portal_customers")
    .update({ session_version: current + 1 })
    .eq("id", portalCustomerId)
    .eq("tenant_id", tenantId);
  await db
    .from("portal_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("portal_customer_id", portalCustomerId)
    .eq("tenant_id", tenantId)
    .is("revoked_at", null);
}
