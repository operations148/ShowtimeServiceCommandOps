import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getPortalCustomerById } from "@/lib/db/queries/portal-customers";
import { sendPortalMagicLink } from "@/lib/portal/send-magic-link";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { recordPortalEvent } from "@/lib/portal/auth";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/portal-users/[id]/resend — resend a secure invite link (admin).
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManagePortalUsers");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  const limit = await checkRateLimit(`${tenantId}:${userId}`, "adminAction");
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });

  const customer = await getPortalCustomerById(id, tenantId);
  if (!customer) return NextResponse.json({ error: "Portal user not found" }, { status: 404 });
  if (!customer.is_active) return NextResponse.json({ error: "This portal user is deactivated" }, { status: 409 });

  try {
    const result = await sendPortalMagicLink(customer, "invite");
    await recordPortalEvent({ tenantId, portalCustomerId: id, eventType: "link_sent", actorUserId: userId });
    await recordAuditEvent({
      tenantId, userId, actionType: "portal_user.reinvited",
      description: `Resent portal invite to ${customer.email}`,
      entityType: "portal_customer", entityId: id,
    });
    return NextResponse.json({ data: { delivered: result.delivered, previewMode: result.previewMode } });
  } catch (err) {
    console.error("[api] POST /api/portal-users/[id]/resend:", err);
    return NextResponse.json({ error: "Failed to resend invite" }, { status: 500 });
  }
}
