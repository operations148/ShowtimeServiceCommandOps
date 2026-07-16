import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { PORTAL_COOKIE, resolvePortalSession } from "@/lib/portal/session";
import type { PortalContext, PortalEventType } from "@/types/portal";

export type PortalAuthResult =
  | { ok: true; context: PortalContext }
  | { ok: false; response: NextResponse };

/**
 * Requires a valid portal session AND re-validates it against the DB on every
 * call (trusted-context, mirrors requireApiAuth for staff). A single generic
 * 401 for any failure — no oracle for why.
 */
export async function requirePortalAuth(): Promise<PortalAuthResult> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PORTAL_COOKIE)?.value;
  const context = await resolvePortalSession(raw);
  if (!context) {
    return { ok: false, response: NextResponse.json({ error: "Please sign in to continue." }, { status: 401 }) };
  }
  return { ok: true, context };
}

/**
 * Asserts a property id is one the portal customer may access. Every portal
 * data query MUST gate on this — a customer can never reach another customer's
 * property, estimate, invoice, or work history.
 */
export function assertPropertyAccess(context: PortalContext, propertyId: string | null | undefined): boolean {
  if (!propertyId) return false;
  return context.propertyIds.includes(propertyId);
}

export async function recordPortalEvent(entry: {
  tenantId: string;
  portalCustomerId?: string | null;
  eventType: PortalEventType;
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await db.from("portal_events").insert({
    tenant_id: entry.tenantId,
    portal_customer_id: entry.portalCustomerId ?? null,
    event_type: entry.eventType,
    actor_user_id: entry.actorUserId ?? null,
    ip: entry.ip ?? null,
    user_agent: entry.userAgent ?? null,
    metadata: entry.metadata ?? null,
  });
  // Never fatal — an audit-log write must not break the action it records.
  if (error) console.error(`[portal] recordPortalEvent: ${error.message}`);
}
