import { db } from '@/lib/db/client'
import { InvoiceStatus } from '@/types/invoice'
import type { Invoice, Payment } from '@/types/invoice'
import { getInvoiceById, recordInvoiceEvent, mapInvoiceRow, type InvoiceRow } from '@/lib/db/queries/invoices'
import {
  insertLedgerRow,
  sumInvoiceLedger,
  getPaymentById,
  type LedgerRowInput,
} from '@/lib/db/queries/payments'
import { isPayable, deriveStatusAfterLedgerChange, canTransition } from './state-machine'
import { amountDue } from '@/lib/money/money'

/**
 * Ledger-backed payment application (Phase 6, ADR-0012).
 *
 * The ledger is the source of truth; the invoice's amount_paid /
 * amount_refunded / credited_amount / status are DERIVED from it. The
 * sequence is: (1) idempotent ledger append — a duplicate webhook or double
 * submit adopts the existing row and stops; (2) re-aggregate the ledger;
 * (3) write the derived aggregates + status onto the invoice. Because step 3
 * always writes ledger-true sums, concurrent applications are self-healing —
 * the last writer wins with numbers that are correct by construction.
 */

export type ApplyLedgerResult =
  | { ok: true; alreadyRecorded: boolean; invoice: Invoice; payment: Payment }
  | { ok: false; reason: 'invoice_not_found' | 'not_payable' | 'refund_target_not_found' | 'refund_exceeds_payment' | 'ledger_error'; detail?: string }

export interface ApplyPaymentInput {
  invoiceId: string
  tenantId: string
  amount: number // cents, positive
  provider: 'stripe' | 'manual'
  providerAccountId?: string
  providerPaymentIntentId?: string
  providerCheckoutSessionId?: string
  providerChargeId?: string
  idempotencyKey?: string
  eventSource: 'webhook' | 'manual'
  metadata?: Record<string, unknown>
  createdBy?: string
  actorName?: string
}

export async function applyPayment(input: ApplyPaymentInput): Promise<ApplyLedgerResult> {
  const invoice = await getInvoiceById(input.invoiceId, input.tenantId)
  if (!invoice) return { ok: false, reason: 'invoice_not_found' }
  if (!isPayable(invoice.status)) {
    return { ok: false, reason: 'not_payable', detail: `status '${invoice.status}' cannot receive payments` }
  }

  const inserted = await insertLedgerRow({
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    kind: 'payment',
    amount: input.amount,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    providerPaymentIntentId: input.providerPaymentIntentId,
    providerCheckoutSessionId: input.providerCheckoutSessionId,
    providerChargeId: input.providerChargeId,
    idempotencyKey: input.idempotencyKey,
    eventSource: input.eventSource,
    metadata: input.metadata,
    createdBy: input.createdBy,
  })
  if (!inserted.ok) return { ok: false, reason: 'ledger_error', detail: inserted.reason }

  // Replay: the money was already recorded — never re-derive or double-apply.
  if (inserted.duplicate) {
    return { ok: true, alreadyRecorded: true, invoice, payment: inserted.payment }
  }

  const updated = await syncInvoiceFromLedger(invoice, input.tenantId)

  await recordInvoiceEvent({
    invoiceId: input.invoiceId,
    tenantId: input.tenantId,
    eventType: 'payment_recorded',
    actorUserId: input.createdBy,
    actorName: input.actorName,
    paymentId: inserted.payment.id,
    metadata: { amount: input.amount, provider: input.provider, source: input.eventSource },
  })

  return { ok: true, alreadyRecorded: false, invoice: updated, payment: inserted.payment }
}

export interface ApplyRefundInput {
  invoiceId: string
  tenantId: string
  /** Ledger payment row being refunded. */
  refundedPaymentId: string
  /** Cents; defaults to the full original payment amount. */
  amount?: number
  provider: 'stripe' | 'manual'
  providerRefundId?: string
  providerAccountId?: string
  reason: string
  eventSource: 'webhook' | 'manual'
  createdBy?: string
  actorName?: string
}

export async function applyRefund(input: ApplyRefundInput): Promise<ApplyLedgerResult> {
  const invoice = await getInvoiceById(input.invoiceId, input.tenantId)
  if (!invoice) return { ok: false, reason: 'invoice_not_found' }

  const original = await getPaymentById(input.refundedPaymentId, input.tenantId)
  if (!original || original.invoice_id !== input.invoiceId || original.kind !== 'payment') {
    return { ok: false, reason: 'refund_target_not_found' }
  }

  const refundAmount = input.amount ?? original.amount
  if (refundAmount > original.amount) {
    return { ok: false, reason: 'refund_exceeds_payment', detail: `refund ${refundAmount} > payment ${original.amount}` }
  }

  const inserted = await insertLedgerRow({
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    kind: 'refund',
    amount: refundAmount,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    providerRefundId: input.providerRefundId,
    refundedPaymentId: input.refundedPaymentId,
    eventSource: input.eventSource,
    metadata: { reason: input.reason },
    createdBy: input.createdBy,
  })
  if (!inserted.ok) return { ok: false, reason: 'ledger_error', detail: inserted.reason }
  if (inserted.duplicate) {
    return { ok: true, alreadyRecorded: true, invoice, payment: inserted.payment }
  }

  const updated = await syncInvoiceFromLedger(invoice, input.tenantId)

  await recordInvoiceEvent({
    invoiceId: input.invoiceId,
    tenantId: input.tenantId,
    eventType: 'refund_recorded',
    actorUserId: input.createdBy,
    actorName: input.actorName,
    paymentId: inserted.payment.id,
    metadata: { amount: refundAmount, reason: input.reason, refunded_payment_id: input.refundedPaymentId },
  })

  return { ok: true, alreadyRecorded: false, invoice: updated, payment: inserted.payment }
}

export interface ApplyCreditInput {
  invoiceId: string
  tenantId: string
  amount: number // cents
  reason: string
  createdBy: string
  actorName?: string
}

export async function applyCredit(input: ApplyCreditInput): Promise<ApplyLedgerResult> {
  const invoice = await getInvoiceById(input.invoiceId, input.tenantId)
  if (!invoice) return { ok: false, reason: 'invoice_not_found' }

  const inserted = await insertLedgerRow({
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    kind: 'credit',
    amount: input.amount,
    provider: 'manual',
    eventSource: 'manual',
    metadata: { reason: input.reason },
    createdBy: input.createdBy,
  })
  if (!inserted.ok) return { ok: false, reason: 'ledger_error', detail: inserted.reason }

  const updated = await syncInvoiceFromLedger(invoice, input.tenantId, { creditReason: input.reason })

  await recordInvoiceEvent({
    invoiceId: input.invoiceId,
    tenantId: input.tenantId,
    eventType: 'credit_recorded',
    actorUserId: input.createdBy,
    actorName: input.actorName,
    paymentId: inserted.payment.id,
    metadata: { amount: input.amount, reason: input.reason },
  })

  return { ok: true, alreadyRecorded: false, invoice: updated, payment: inserted.payment }
}

/**
 * Recomputes the invoice's money aggregates + status from the ledger and
 * writes them. Always writes ledger-true sums (never increments), so a racing
 * pair of applications converges on correct numbers.
 */
async function syncInvoiceFromLedger(
  invoice: Invoice,
  tenantId: string,
  opts: { creditReason?: string } = {},
): Promise<Invoice> {
  const sums = await sumInvoiceLedger(invoice.id, tenantId)
  const derived = deriveStatusAfterLedgerChange(invoice.status, {
    total: invoice.total,
    amountPaid: sums.paid,
    amountRefunded: sums.refunded,
    creditedAmount: sums.credited,
  })

  const netPaid = Math.max(0, sums.paid - sums.refunded)
  const patch: Record<string, unknown> = {
    amount_paid: sums.paid,
    amount_refunded: sums.refunded,
    credited_amount: sums.credited,
    amount_due: amountDue(invoice.total, netPaid + sums.credited),
  }
  if (opts.creditReason) patch.credit_reason = opts.creditReason

  // Only move the status when the machine allows it — a webhook arriving on a
  // voided invoice records the ledger fact but never resurrects the document.
  if (derived !== invoice.status && canTransition(invoice.status, derived)) {
    patch.status = derived
    if (derived === InvoiceStatus.PAID && !invoice.paid_at) patch.paid_at = new Date().toISOString()
    if (derived === InvoiceStatus.REFUNDED && !invoice.refunded_at) patch.refunded_at = new Date().toISOString()
  }

  const { data, error } = await db
    .from('invoices')
    .update(patch)
    .eq('id', invoice.id)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) {
    console.error(`[invoices] syncInvoiceFromLedger: ${error.message}`)
    return invoice
  }
  return mapInvoiceRow(data as unknown as InvoiceRow)
}
