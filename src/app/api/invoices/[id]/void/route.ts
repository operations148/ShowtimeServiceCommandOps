import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { voidInvoice } from "@/lib/db/queries/invoices";
import { VoidInvoiceSchema } from "@/lib/validation/invoice";
import { recordInvoiceEvent } from "@/lib/db/queries/invoices";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/invoices/[id]/void — unpaid invoices only (money that moved goes
// through refund/credit). Version-gated, mandatory reason.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VoidInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A reason is required to void an invoice", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await voidInvoice(id, tenantId, userId, parsed.data.reason, parsed.data.version);
    if (!result.ok) {
      if ("conflict" in result) return NextResponse.json({ error: "This invoice was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      if ("notVoidable" in result) return NextResponse.json({ error: `An invoice in status '${result.status}' cannot be voided — use refund or credit instead` }, { status: 409 });
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    await recordInvoiceEvent({ invoiceId: id, tenantId, eventType: "voided", actorUserId: userId, metadata: { reason: parsed.data.reason } });
    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "invoice.voided",
      description: `Voided invoice ${result.data.invoice_number}`,
      entityType: "invoice",
      entityId: id,
      metadata: { reason: parsed.data.reason },
    });
    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] POST /api/invoices/[id]/void:", err);
    return NextResponse.json({ error: "Failed to void invoice" }, { status: 500 });
  }
}
