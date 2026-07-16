import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listPortalCustomers, invitePortalCustomer } from "@/lib/db/queries/portal-customers";
import { getPortalCustomerById } from "@/lib/db/queries/portal-customers";
import { sendPortalMagicLink } from "@/lib/portal/send-magic-link";
import { InvitePortalCustomerSchema } from "@/lib/validation/portal";
import { recordPortalEvent } from "@/lib/portal/auth";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/portal-users — list portal customers for the tenant (admin).
export async function GET() {
  const auth = await requirePermission("canManagePortalUsers");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  try {
    return NextResponse.json({ data: await listPortalCustomers(tenantId) });
  } catch (err) {
    console.error("[api] GET /api/portal-users:", err);
    return NextResponse.json({ error: "Failed to load portal users" }, { status: 500 });
  }
}

// POST /api/portal-users — invite (or re-grant) a portal customer + email an
// invite magic link.
export async function POST(request: NextRequest) {
  const auth = await requirePermission("canManagePortalUsers");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = InvitePortalCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await invitePortalCustomer(parsed.data, tenantId, userId);
    if (!result.ok) {
      return NextResponse.json({ error: "One or more properties don't belong to this tenant" }, { status: 422 });
    }

    // Re-load with session_version etc. and send the invite link.
    const customer = await getPortalCustomerById(result.customer.id, tenantId);
    if (customer) await sendPortalMagicLink(customer, "invite");

    await recordPortalEvent({ tenantId, portalCustomerId: result.customer.id, eventType: "invited", actorUserId: userId, metadata: { created: result.created } });
    await recordAuditEvent({
      tenantId, userId, actionType: "portal_user.invited",
      description: `Invited portal customer ${result.customer.email}`,
      entityType: "portal_customer", entityId: result.customer.id,
    });
    return NextResponse.json({ data: result.customer }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/portal-users:", err);
    return NextResponse.json({ error: "Failed to invite portal user" }, { status: 500 });
  }
}
