import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listPaymentsForInvoice } from "@/lib/db/queries/payments";
import { applyPayment } from "@/lib/invoices/apply-payment";
import { RecordManualPaymentSchema } from "@/lib/validation/invoice";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/invoices/[id]/payments — the ledger for this invoice.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewInvoices");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    return NextResponse.json({ data: await listPaymentsForInvoice(id, tenantId) });
  } catch (err) {
    console.error("[api] GET /api/invoices/[id]/payments:", err);
    return NextResponse.json({ error: "Failed to load payments" }, { status: 500 });
  }
}

// POST /api/invoices/[id]/payments — record a manual (offline) payment:
// check, cash, ACH received outside Stripe. Ledger-backed + idempotent.
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

  const parsed = RecordManualPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await applyPayment({
      invoiceId: id,
      tenantId,
      amount: parsed.data.amount,
      provider: "manual",
      eventSource: "manual",
      metadata: parsed.data.reference ? { reference: parsed.data.reference } : undefined,
      createdBy: userId,
      actorName: (auth.session.user as { name?: string }).name,
    });
    if (!result.ok) {
      const statusMap: Record<string, number> = { invoice_not_found: 404, not_payable: 409, ledger_error: 500 };
      return NextResponse.json({ error: paymentErrorMessage(result.reason), detail: result.detail }, { status: statusMap[result.reason] ?? 500 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "payment.recorded",
      description: `Recorded manual payment of ${parsed.data.amount} cents on invoice ${id}`,
      entityType: "invoice",
      entityId: id,
      metadata: { amount: parsed.data.amount, payment_id: result.payment.id },
    });

    return NextResponse.json({ data: { invoice: result.invoice, payment: result.payment, alreadyRecorded: result.alreadyRecorded } }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/invoices/[id]/payments:", err);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}

function paymentErrorMessage(reason: string): string {
  switch (reason) {
    case "invoice_not_found": return "Invoice not found";
    case "not_payable": return "This invoice cannot receive a payment in its current status";
    default: return "Failed to record payment";
  }
}
