import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { revokeInvoiceToken, recordInvoiceEvent } from "@/lib/db/queries/invoices";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/invoices/[id]/revoke-token — invalidate the public link.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  try {
    const revoked = await revokeInvoiceToken(id, tenantId);
    if (!revoked) return NextResponse.json({ error: "Invoice not found or has no active link" }, { status: 404 });

    await recordInvoiceEvent({ invoiceId: id, tenantId, eventType: "token_revoked", actorUserId: userId });
    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "invoice.token_revoked",
      description: `Revoked public link for invoice ${id}`,
      entityType: "invoice",
      entityId: id,
    });
    return NextResponse.json({ data: { revoked: true } });
  } catch (err) {
    console.error("[api] POST /api/invoices/[id]/revoke-token:", err);
    return NextResponse.json({ error: "Failed to revoke link" }, { status: 500 });
  }
}
