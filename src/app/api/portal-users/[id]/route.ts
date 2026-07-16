import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import {
  getPortalCustomerById,
  getPortalCustomerPropertyIds,
  updatePortalCustomer,
  listPortalSessions,
  listPortalEvents,
} from "@/lib/db/queries/portal-customers";
import { revokeAllPortalSessions } from "@/lib/portal/session";
import { UpdatePortalCustomerSchema } from "@/lib/validation/portal";
import { recordPortalEvent } from "@/lib/portal/auth";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/portal-users/[id] — detail + linked properties + sessions + access history.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManagePortalUsers");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const customer = await getPortalCustomerById(id, tenantId);
  if (!customer) return NextResponse.json({ error: "Portal user not found" }, { status: 404 });

  const [propertyIds, sessions, events] = await Promise.all([
    getPortalCustomerPropertyIds(id, tenantId),
    listPortalSessions(id, tenantId),
    listPortalEvents(id, tenantId),
  ]);
  return NextResponse.json({ data: { customer, property_ids: propertyIds, sessions, events } });
}

// PATCH /api/portal-users/[id] — update name/phone/properties, or revoke access
// (is_active=false, which — combined with the trusted-context check — locks the
// customer out immediately; also revoke all sessions on deactivation).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManagePortalUsers");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = UpdatePortalCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const result = await updatePortalCustomer(id, parsed.data, tenantId);
  if (!result.ok) {
    if ("invalidProperty" in result) return NextResponse.json({ error: "One or more properties don't belong to this tenant" }, { status: 422 });
    return NextResponse.json({ error: "Portal user not found" }, { status: 404 });
  }

  const deactivated = parsed.data.is_active === false;
  if (deactivated) {
    await revokeAllPortalSessions(id, tenantId);
    await recordPortalEvent({ tenantId, portalCustomerId: id, eventType: "access_revoked", actorUserId: userId });
  }
  await recordAuditEvent({
    tenantId, userId,
    actionType: deactivated ? "portal_user.access_revoked" : "portal_user.updated",
    description: `${deactivated ? "Revoked access for" : "Updated"} portal customer ${result.customer.email}`,
    entityType: "portal_customer", entityId: id,
  });
  return NextResponse.json({ data: result.customer });
}
