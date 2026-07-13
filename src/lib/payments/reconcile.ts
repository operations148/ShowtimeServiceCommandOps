import { db } from '@/lib/db/client'
import { InvoiceStatus } from '@/types/invoice'
import type { Payment, ReconciliationFindingType } from '@/types/invoice'
import { deriveStatusAfterLedgerChange, isOverdueEligible, isTerminal } from '@/lib/invoices/state-machine'
import { recordInvoiceEvent } from '@/lib/db/queries/invoices'
import { getStripeClient } from '@/lib/stripe/client'
import { logger } from '@/lib/security/logger'

/**
 * Payment reconciliation (Phase 6, ADR-0012). Scheduled (cron) or
 * admin-triggered. Cross-checks three sources of truth against each other:
 *
 *   1. Ledger ⇄ invoice aggregates — every open/paid invoice's
 *      amount_paid/refunded/credited and derived status must equal what its
 *      ledger rows sum to (status_mismatch / amount_mismatch findings).
 *   2. Ledger ⇄ provider — each unreconciled Stripe ledger row's
 *      PaymentIntent must exist and be succeeded on the expected connected
 *      account (orphaned_payment / account_mismatch findings).
 *   3. Webhook dead-letter — webhook_events rows stuck in 'error' represent
 *      provider events we may have missed (missing_ledger_entry findings).
 *
 * Findings are per-tenant rows an admin resolves with a mandatory reason;
 * the run itself is platform-wide and fully audited (reconciliation_runs).
 * Aging is folded in here too: open invoices past due are marked OVERDUE.
 */

export interface ReconcileResult {
  runId: string
  invoicesChecked: number
  paymentsChecked: number
  findingsCount: number
  overdueMarked: number
}

interface InvoiceAggRow {
  id: string
  tenant_id: string
  status: string
  total: number
  amount_paid: number
  amount_refunded: number | null
  credited_amount: number | null
  due_date: string | null
}

export async function runReconciliation(
  triggeredBy: 'cron' | 'manual',
  triggeredUserId?: string,
): Promise<ReconcileResult> {
  const { data: runRow, error: runErr } = await db
    .from('reconciliation_runs')
    .insert({ triggered_by: triggeredBy, triggered_user_id: triggeredUserId ?? null })
    .select('id')
    .single()
  if (runErr) throw new Error(`[reconcile] could not create run: ${runErr.message}`)
  const runId = (runRow as { id: string }).id

  let invoicesChecked = 0
  let paymentsChecked = 0
  let findingsCount = 0
  let overdueMarked = 0

  async function flag(
    tenantId: string,
    findingType: ReconciliationFindingType,
    detail: Record<string, unknown>,
    ids: { invoiceId?: string; paymentId?: string },
  ) {
    findingsCount++
    const { error } = await db.from('reconciliation_findings').insert({
      run_id: runId,
      tenant_id: tenantId,
      invoice_id: ids.invoiceId ?? null,
      payment_id: ids.paymentId ?? null,
      finding_type: findingType,
      detail,
    })
    if (error) logger.error('[reconcile] finding insert failed', { error: error.message })
    if (ids.invoiceId) {
      await recordInvoiceEvent({
        invoiceId: ids.invoiceId,
        tenantId,
        eventType: 'reconciliation_flagged',
        metadata: { run_id: runId, finding_type: findingType, ...detail },
      })
    }
  }

  try {
    // ── 1. Ledger ⇄ invoice aggregates + aging ────────────────────────────────
    const { data: invoiceRows, error: invErr } = await db
      .from('invoices')
      .select('id, tenant_id, status, total, amount_paid, amount_refunded, credited_amount, due_date')
      .not('status', 'in', '("draft","ready","void")')
    if (invErr) throw new Error(`[reconcile] invoices fetch: ${invErr.message}`)

    const today = new Date().toISOString().slice(0, 10)

    for (const inv of (invoiceRows ?? []) as InvoiceAggRow[]) {
      invoicesChecked++
      const { data: ledgerRows } = await db
        .from('payments')
        .select('kind, amount, status')
        .eq('invoice_id', inv.id)
        .eq('tenant_id', inv.tenant_id)

      const sums = { paid: 0, refunded: 0, credited: 0 }
      for (const p of (ledgerRows ?? []) as Array<{ kind: string; amount: number; status: string }>) {
        if (p.status !== 'succeeded') continue
        if (p.kind === 'payment') sums.paid += p.amount
        else if (p.kind === 'refund') sums.refunded += p.amount
        else if (p.kind === 'credit') sums.credited += p.amount
      }

      const status = inv.status as InvoiceStatus

      // Amount drift between the ledger and the invoice's cached aggregates.
      // Legacy pre-ledger rows (deposit_paid era) may legitimately carry
      // amount_paid with no ledger rows — only flag when the ledger has data.
      const hasLedger = (ledgerRows ?? []).length > 0
      if (hasLedger && (sums.paid !== inv.amount_paid || sums.refunded !== (inv.amount_refunded ?? 0) || sums.credited !== (inv.credited_amount ?? 0))) {
        await flag(inv.tenant_id, 'amount_mismatch', {
          ledger: sums,
          invoice: { amount_paid: inv.amount_paid, amount_refunded: inv.amount_refunded, credited_amount: inv.credited_amount },
        }, { invoiceId: inv.id })
      }

      // Status drift: the derived status disagrees with the stored one.
      if (hasLedger && !isTerminal(status)) {
        const derived = deriveStatusAfterLedgerChange(status, {
          total: inv.total,
          amountPaid: sums.paid,
          amountRefunded: sums.refunded,
          creditedAmount: sums.credited,
        })
        const agingEquivalent =
          (derived === InvoiceStatus.PARTIALLY_PAID && status === InvoiceStatus.OVERDUE)
        if (derived !== status && !agingEquivalent) {
          await flag(inv.tenant_id, 'status_mismatch', { stored: status, derived }, { invoiceId: inv.id })
        }
      }

      // Aging: open invoices past due → OVERDUE (audited, idempotent).
      if (isOverdueEligible(status, inv.due_date, today)) {
        const { error: ovErr } = await db
          .from('invoices')
          .update({ status: InvoiceStatus.OVERDUE })
          .eq('id', inv.id)
          .eq('tenant_id', inv.tenant_id)
          .eq('status', status) // no-op if something else moved it meanwhile
        if (!ovErr) {
          overdueMarked++
          await recordInvoiceEvent({
            invoiceId: inv.id,
            tenantId: inv.tenant_id,
            eventType: 'overdue_marked',
            metadata: { run_id: runId, due_date: inv.due_date },
          })
        }
      }
    }

    // ── 2. Ledger ⇄ provider (Stripe) ────────────────────────────────────────
    const { data: unreconciled, error: payErr } = await db
      .from('payments')
      .select('*')
      .eq('provider', 'stripe')
      .eq('reconciliation_status', 'unreconciled')
      .eq('status', 'succeeded')
      .limit(200)
    if (payErr) throw new Error(`[reconcile] payments fetch: ${payErr.message}`)

    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY
    for (const p of (unreconciled ?? []) as Payment[]) {
      paymentsChecked++
      if (!stripeConfigured || !p.provider_payment_intent_id) continue

      try {
        const stripe = getStripeClient()
        const intent = await stripe.paymentIntents.retrieve(
          p.provider_payment_intent_id,
          {},
          p.provider_account_id ? { stripeAccount: p.provider_account_id } : undefined,
        )

        if (p.kind === 'payment' && intent.status !== 'succeeded') {
          await flag(p.tenant_id, 'orphaned_payment', {
            payment_intent: p.provider_payment_intent_id,
            provider_status: intent.status,
          }, { invoiceId: p.invoice_id, paymentId: p.id })
          await db.from('payments').update({ reconciliation_status: 'mismatch', reconciled_at: new Date().toISOString() }).eq('id', p.id)
          continue
        }
        if (p.kind === 'payment' && intent.amount !== p.amount) {
          await flag(p.tenant_id, 'amount_mismatch', {
            payment_intent: p.provider_payment_intent_id,
            provider_amount: intent.amount,
            ledger_amount: p.amount,
          }, { invoiceId: p.invoice_id, paymentId: p.id })
          await db.from('payments').update({ reconciliation_status: 'mismatch', reconciled_at: new Date().toISOString() }).eq('id', p.id)
          continue
        }

        await db.from('payments').update({ reconciliation_status: 'reconciled', reconciled_at: new Date().toISOString() }).eq('id', p.id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // resource_missing on the expected account = the intent isn't there —
        // possibly created on a different connected account.
        if (msg.includes('No such payment_intent') || msg.includes('resource_missing')) {
          await flag(p.tenant_id, 'account_mismatch', {
            payment_intent: p.provider_payment_intent_id,
            expected_account: p.provider_account_id,
            error: msg,
          }, { invoiceId: p.invoice_id, paymentId: p.id })
          await db.from('payments').update({ reconciliation_status: 'mismatch', reconciled_at: new Date().toISOString() }).eq('id', p.id)
        } else {
          logger.warn('[reconcile] provider check failed (transient, will retry next run)', { paymentId: p.id, error: msg })
        }
      }
    }

    // ── 3. Webhook dead-letter — provider events we failed to process ────────
    const { data: deadLetters } = await db
      .from('webhook_events')
      .select('event_id, last_error, processed_at')
      .eq('provider', 'stripe')
      .eq('processing_status', 'error')
      .limit(50)
    for (const evt of (deadLetters ?? []) as Array<{ event_id: string; last_error: string | null }>) {
      // Platform-scope finding (no tenant resolvable without reprocessing) —
      // recorded on the run itself via findings with the platform tenant NULLed
      // is not allowed (tenant_id NOT NULL), so we log + count these in the
      // run error detail instead. Admin re-delivery from the Stripe dashboard
      // is the resolution path (see docs/operations/stripe-runbook.md).
      logger.warn('[reconcile] dead-letter webhook event needs redelivery', {
        eventId: evt.event_id,
        lastError: evt.last_error,
      })
    }
    const deadLetterCount = (deadLetters ?? []).length

    await db
      .from('reconciliation_runs')
      .update({
        status: 'completed',
        invoices_checked: invoicesChecked,
        payments_checked: paymentsChecked,
        findings_count: findingsCount,
        error_detail: deadLetterCount > 0 ? `${deadLetterCount} dead-letter webhook event(s) need redelivery` : null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId)

    return { runId, invoicesChecked, paymentsChecked, findingsCount, overdueMarked }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db
      .from('reconciliation_runs')
      .update({ status: 'failed', error_detail: msg, finished_at: new Date().toISOString() })
      .eq('id', runId)
    throw err
  }
}
