import { db } from '@/lib/db/client'
import type {
  Payment,
  PaymentKind,
  PaymentProvider,
  PaymentEventSource,
  PaymentStatus,
  ReconciliationStatus,
} from '@/types/invoice'
import { nextDocumentNumber } from './document-numbers'

/**
 * The immutable payment ledger (Phase 6, ADR-0012). Rows are append-only:
 * nothing here exposes an update path except the reconciliation stamps.
 * Corrections are made by appending offsetting rows (refund/credit).
 */

const PG_UNIQUE_VIOLATION = '23505'

export interface LedgerRowInput {
  tenantId: string
  invoiceId: string
  kind: PaymentKind
  /** Always positive cents; kind carries direction. */
  amount: number
  currency?: string
  provider: PaymentProvider
  providerAccountId?: string
  providerPaymentIntentId?: string
  providerCheckoutSessionId?: string
  providerChargeId?: string
  providerRefundId?: string
  status?: PaymentStatus
  failureCode?: string
  failureMessage?: string
  refundedPaymentId?: string
  idempotencyKey?: string
  eventSource: PaymentEventSource
  metadata?: Record<string, unknown>
  createdBy?: string
}

export type LedgerInsertResult =
  | { ok: true; payment: Payment; duplicate: false }
  | { ok: true; payment: Payment; duplicate: true }
  | { ok: false; reason: string }

/**
 * Idempotent append. Duplicate submissions (same Stripe PaymentIntent for a
 * payment, same Stripe refund id, or same caller idempotency key) hit the
 * partial unique indexes, get adopted, and return { duplicate: true } —
 * a replayed webhook can never double-record money movement.
 */
export async function insertLedgerRow(input: LedgerRowInput): Promise<LedgerInsertResult> {
  const paymentNumber = await nextDocumentNumber(input.tenantId, 'payment')

  const { data, error } = await db
    .from('payments')
    .insert({
      tenant_id: input.tenantId,
      invoice_id: input.invoiceId,
      payment_number: paymentNumber,
      kind: input.kind,
      amount: input.amount,
      currency: input.currency ?? 'usd',
      provider: input.provider,
      provider_account_id: input.providerAccountId ?? null,
      provider_payment_intent_id: input.providerPaymentIntentId ?? null,
      provider_checkout_session_id: input.providerCheckoutSessionId ?? null,
      provider_charge_id: input.providerChargeId ?? null,
      provider_refund_id: input.providerRefundId ?? null,
      status: input.status ?? 'succeeded',
      failure_code: input.failureCode ?? null,
      failure_message: input.failureMessage ?? null,
      refunded_payment_id: input.refundedPaymentId ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      event_source: input.eventSource,
      metadata: input.metadata ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      const existing = await findExistingLedgerRow(input)
      if (existing) return { ok: true, payment: existing, duplicate: true }
      return { ok: false, reason: 'duplicate ledger row exists but could not be re-fetched' }
    }
    return { ok: false, reason: error.message }
  }

  return { ok: true, payment: data as unknown as Payment, duplicate: false }
}

async function findExistingLedgerRow(input: LedgerRowInput): Promise<Payment | undefined> {
  let q = db.from('payments').select('*').eq('tenant_id', input.tenantId)
  if (input.idempotencyKey) {
    q = q.eq('idempotency_key', input.idempotencyKey)
  } else if (input.providerRefundId) {
    q = q.eq('provider_refund_id', input.providerRefundId)
  } else if (input.providerPaymentIntentId && input.kind === 'payment') {
    q = q.eq('provider_payment_intent_id', input.providerPaymentIntentId).eq('kind', 'payment')
  } else {
    return undefined
  }
  const { data } = await q.maybeSingle()
  return (data as unknown as Payment) ?? undefined
}

export async function getPaymentById(id: string, tenantId: string): Promise<Payment | undefined> {
  const { data, error } = await db
    .from('payments')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new Error(`[db] getPaymentById: ${error.message}`)
  return (data as unknown as Payment) ?? undefined
}

export async function listPaymentsForInvoice(
  invoiceId: string,
  tenantId: string,
): Promise<Payment[]> {
  const { data, error } = await db
    .from('payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`[db] listPaymentsForInvoice: ${error.message}`)
  return (data ?? []) as unknown as Payment[]
}

export interface LedgerSums {
  paid: number
  refunded: number
  credited: number
}

/**
 * Aggregates the succeeded ledger rows for an invoice. This is the source of
 * truth the invoice's amount_paid/amount_refunded/credited_amount columns are
 * derived FROM — recomputing from the ledger makes concurrent payment
 * application self-healing (the last writer always writes ledger-true sums).
 */
export async function sumInvoiceLedger(invoiceId: string, tenantId: string): Promise<LedgerSums> {
  const rows = await listPaymentsForInvoice(invoiceId, tenantId)
  const sums: LedgerSums = { paid: 0, refunded: 0, credited: 0 }
  for (const p of rows) {
    if (p.status !== 'succeeded') continue
    if (p.kind === 'payment') sums.paid += p.amount
    else if (p.kind === 'refund') sums.refunded += p.amount
    else if (p.kind === 'credit') sums.credited += p.amount
  }
  return sums
}

export async function setPaymentReconciliation(
  paymentId: string,
  tenantId: string,
  status: ReconciliationStatus,
): Promise<void> {
  const { error } = await db
    .from('payments')
    .update({ reconciliation_status: status, reconciled_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('tenant_id', tenantId)
  if (error) console.error(`[db] setPaymentReconciliation: ${error.message}`)
}
