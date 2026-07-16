import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getPortalCustomerById } from "@/lib/db/queries/portal-customers";
import { revokeAllPortalSessions } from "@/lib/portal/session";
import { recordPortalEvent } from "@/lib/portal/auth";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/portal-users/[id]/revoke-sessions — sign the customer out of every
// device (bumps session_version + marks sessions revoked). Admin action.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManagePortalUsers");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  const customer = await getPortalCustomerById(id, tenantId);
  if (!customer) return NextResponse.json({ error: "Portal user not found" }, { status: 404 });

  await revokeAllPortalSessions(id, tenantId);
  await recordPortalEvent({ tenantId, portalCustomerId: id, eventType: "sessions_revoked_all", actorUserId: userId });
  await recordAuditEvent({
    tenantId, userId, actionType: "portal_user.sessions_revoked",
    description: `Revoked all sessions for portal customer ${customer.email}`,
    entityType: "portal_customer", entityId: id,
  });
  return NextResponse.json({ data: { ok: true } });
}
