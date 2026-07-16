import { NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal/auth";
import { db } from "@/lib/db/client";
import type { PortalSessionSummary } from "@/types/portal";

export const dynamic = "force-dynamic";

// GET /api/portal/sessions — the customer's own active sessions (Security page).
export async function GET() {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;

  const { data, error } = await db
    .from("portal_sessions")
    .select("id, issued_at, last_seen_at, ip, user_agent, revoked_at, expires_at")
    .eq("portal_customer_id", context.portalCustomerId)
    .eq("tenant_id", context.tenantId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("issued_at", { ascending: false });
  if (error) {
    console.error("[api] GET /api/portal/sessions:", error.message);
    return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
  }

  const sessions: PortalSessionSummary[] = ((data ?? []) as Record<string, string | null>[]).map((s) => ({
    id: s.id as string,
    issued_at: s.issued_at as string,
    last_seen_at: s.last_seen_at ?? null,
    ip: s.ip ?? null,
    user_agent: s.user_agent ?? null,
    current: s.id === context.sessionId,
  }));
  return NextResponse.json({ data: sessions });
}
