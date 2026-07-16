import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { applyCredit } from "@/lib/invoices/apply-payment";
import { CreditInvoiceSchema } from "@/lib/validation/invoice";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/invoices/[id]/credit — apply a credit adjustment (reduces the
// balance owed without money moving). Ledger-backed. Gated on canManageInvoices.
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

  const parsed = CreditInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await applyCredit({
      invoiceId: id,
      tenantId,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      createdBy: userId,
      actorName: (auth.session.user as { name?: string }).name,
    });
    if (!result.ok) {
      const statusMap: Record<string, number> = { invoice_not_found: 404, ledger_error: 500 };
      return NextResponse.json({ error: result.reason === "invoice_not_found" ? "Invoice not found" : "Failed to apply credit", detail: result.detail }, { status: statusMap[result.reason] ?? 500 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "payment.credited",
      description: `Applied ${parsed.data.amount} cent credit to invoice ${id}`,
      entityType: "invoice",
      entityId: id,
      metadata: { amount: parsed.data.amount, reason: parsed.data.reason },
    });

    return NextResponse.json({ data: { invoice: result.invoice, payment: result.payment } }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/invoices/[id]/credit:", err);
    return NextResponse.json({ error: "Failed to apply credit" }, { status: 500 });
  }
}
