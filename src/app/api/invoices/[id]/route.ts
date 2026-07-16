import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getInvoiceById, patchInvoiceDocument } from "@/lib/db/queries/invoices";
import { listPaymentsForInvoice } from "@/lib/db/queries/payments";
import { PatchInvoiceSchema } from "@/lib/validation/invoice";
import { recordInvoiceEvent } from "@/lib/db/queries/invoices";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/invoices/[id] — includes line items + ledger payments.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const invoice = await getInvoiceById(id, tenantId, { withLines: true });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const payments = await listPaymentsForInvoice(id, tenantId);
    return NextResponse.json({ data: invoice, payments });
  } catch (err) {
    console.error("[api] GET /api/invoices/[id]:", err);
    return NextResponse.json({ error: "Failed to load invoice" }, { status: 500 });
  }
}

// PATCH /api/invoices/[id] — draft/ready edits only; version-gated; totals recomputed.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = PatchInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await patchInvoiceDocument(id, parsed.data, tenantId);
    if (!result.ok) {
      if ("conflict" in result) return NextResponse.json({ error: "This invoice was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      if ("notEditable" in result) return NextResponse.json({ error: `An invoice in status '${result.status}' cannot be edited` }, { status: 409 });
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    await recordInvoiceEvent({ invoiceId: id, tenantId, eventType: "updated", actorUserId: userId });
    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "invoice.updated",
      description: `Updated invoice ${result.data.invoice_number}`,
      entityType: "invoice",
      entityId: id,
    });
    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] PATCH /api/invoices/[id]:", err);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}
