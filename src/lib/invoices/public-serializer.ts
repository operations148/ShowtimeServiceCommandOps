import type {
  Invoice,
  InvoiceLineItem,
  Payment,
  PublicInvoice,
  PublicInvoiceLineItem,
  PublicPaymentSummary,
} from "@/types/invoice";
import type { TenantBranding } from "@/lib/estimates/public-serializer";

/**
 * Redacts a full invoice down to the ONLY fields safe to expose on the public
 * customer payment route (Phase 6; same allowlist discipline as ADR-0007's
 * PublicEstimate and Phase 5's PublicChangeOrder). The output type literally
 * cannot carry internal fields — a future column addition can never leak by
 * default, it simply won't be copied.
 *
 * Explicitly NEVER exposed: tenant_id, GHL ids, staff ids, internal
 * source/pricebook pointers, token hashes, Stripe provider ids, and any
 * internal cost data.
 */

function toPublicLine(line: InvoiceLineItem): PublicInvoiceLineItem {
  return {
    id: line.id,
    description: line.description,
    details: line.details ?? null,
    quantity: line.quantity,
    unit_price: line.unit_price,
    total: line.total,
  };
}

function toPublicPayment(p: Payment): PublicPaymentSummary {
  return {
    kind: p.kind,
    amount: p.amount,
    created_at: p.created_at,
  };
}

export function isInvoiceTokenExpired(invoice: Pick<Invoice, "token_expires_at">, now = new Date()): boolean {
  if (!invoice.token_expires_at) return false;
  return new Date(invoice.token_expires_at).getTime() < now.getTime();
}

export function toPublicInvoice(
  invoice: Invoice,
  lines: InvoiceLineItem[],
  payments: Payment[],
  branding: TenantBranding,
  opts: { canPayOnline: boolean }
): PublicInvoice {
  // Only succeeded money movements are customer-visible history.
  const visiblePayments = payments.filter((p) => p.status === "succeeded");
  const netPaid = invoice.amount_paid - invoice.amount_refunded;

  return {
    invoice_number: invoice.invoice_number,
    title: invoice.title,
    status: invoice.status,
    invoice_kind: invoice.invoice_kind,
    milestone_label: invoice.milestone_label ?? null,

    customer_name: invoice.customer_name,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date ?? null,

    subtotal: invoice.subtotal,
    tax_rate: invoice.tax_rate,
    tax_amount: invoice.tax_amount,
    discount_amount: invoice.discount_amount,
    total: invoice.total,
    amount_paid: invoice.amount_paid,
    amount_due: invoice.amount_due,
    amount_refunded: invoice.amount_refunded,

    deposit_required: invoice.deposit_required,
    deposit_amount: invoice.deposit_amount,
    deposit_paid: netPaid >= invoice.deposit_amount && invoice.deposit_amount > 0,

    notes: invoice.notes ?? null,
    terms: invoice.terms ?? null,
    payment_instructions: invoice.payment_instructions ?? null,

    line_items: lines.map(toPublicLine),
    payments: visiblePayments.map(toPublicPayment),

    company_name: branding.company_name,
    company_logo_url: branding.company_logo_url ?? null,
    company_phone: branding.company_phone ?? null,
    company_email: branding.company_email ?? null,

    paid_at: invoice.paid_at ?? null,
    is_expired: isInvoiceTokenExpired(invoice),
    can_pay_online: opts.canPayOnline,
  };
}
