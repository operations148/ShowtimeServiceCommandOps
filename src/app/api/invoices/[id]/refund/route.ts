import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getPaymentById } from "@/lib/db/queries/payments";
import { getTenantById } from "@/lib/db/queries/tenants";
import { applyRefund } from "@/lib/invoices/apply-payment";
import { createStripeRefund } from "@/lib/stripe/refunds";
import { RefundPaymentSchema } from "@/lib/validation/invoice";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/invoices/[id]/refund — refund a recorded payment. Stripe payments
// issue the provider refund first (the charge.refunded webhook echo is
// idempotent via provider_refund_id); manual payments record a ledger-only
// refund. Gated on canRefundPayments.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canRefundPayments");
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

  const parsed = RefundPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const payment = await getPaymentById(parsed.data.payment_id, tenantId);
    if (!payment || payment.invoice_id !== id) {
      return NextResponse.json({ error: "Payment not found for this invoice" }, { status: 404 });
    }

    let providerRefundId: string | undefined;
    if (payment.provider === "stripe") {
      const tenant = await getTenantById(tenantId);
      if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
      const stripeResult = await createStripeRefund(payment, tenant, parsed.data.amount);
      if (!stripeResult.ok) {
        return NextResponse.json({ error: "Stripe refund failed", detail: stripeResult.detail ?? stripeResult.reason }, { status: 502 });
      }
      providerRefundId = stripeResult.refundId;
    }

    const result = await applyRefund({
      invoiceId: id,
      tenantId,
      refundedPaymentId: parsed.data.payment_id,
      amount: parsed.data.amount,
      provider: payment.provider,
      providerRefundId,
      providerAccountId: payment.provider_account_id ?? undefined,
      reason: parsed.data.reason,
      eventSource: "manual",
      createdBy: userId,
      actorName: (auth.session.user as { name?: string }).name,
    });
    if (!result.ok) {
      const statusMap: Record<string, number> = { invoice_not_found: 404, refund_target_not_found: 404, refund_exceeds_payment: 422, ledger_error: 500 };
      return NextResponse.json({ error: refundErrorMessage(result.reason), detail: result.detail }, { status: statusMap[result.reason] ?? 500 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "payment.refunded",
      description: `Refunded payment ${parsed.data.payment_id} on invoice ${id}`,
      entityType: "invoice",
      entityId: id,
      metadata: { payment_id: parsed.data.payment_id, amount: parsed.data.amount, reason: parsed.data.reason },
    });

    return NextResponse.json({ data: { invoice: result.invoice, payment: result.payment } }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/invoices/[id]/refund:", err);
    return NextResponse.json({ error: "Failed to refund payment" }, { status: 500 });
  }
}

function refundErrorMessage(reason: string): string {
  switch (reason) {
    case "invoice_not_found": return "Invoice not found";
    case "refund_target_not_found": return "The payment being refunded was not found";
    case "refund_exceeds_payment": return "Refund amount exceeds the original payment";
    default: return "Failed to refund payment";
  }
}
