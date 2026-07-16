import { type NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, recordPortalEvent } from "@/lib/portal/auth";
import { revokePortalSession } from "@/lib/portal/session";
import { getClientIp } from "@/lib/security/rate-limit";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// DELETE /api/portal/sessions/[id] — revoke one of the customer's OWN sessions.
// The ownership check (portal_customer_id match) prevents revoking anyone else's.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalAuth();
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { id } = await params;

  const { data: owned } = await db
    .from("portal_sessions")
    .select("id")
    .eq("id", id)
    .eq("portal_customer_id", context.portalCustomerId)
    .eq("tenant_id", context.tenantId)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  await revokePortalSession(id, context.tenantId);
  await recordPortalEvent({
    tenantId: context.tenantId,
    portalCustomerId: context.portalCustomerId,
    eventType: "session_revoked",
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
    metadata: { revoked_session_id: id },
  });
  return NextResponse.json({ data: { ok: true } });
}
