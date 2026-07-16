import { getStripeClient } from './client'
import type { Payment } from '@/types/invoice'
import type { TenantRow } from '@/lib/db/types'

/**
 * Stripe refunds on the connected account (Phase 6). Issues the provider
 * refund only — the ledger row is written by applyRefund() when the
 * charge.refunded webhook arrives OR immediately by the admin route
 * (idempotent either way: the ledger keys on provider_refund_id, so the
 * webhook echo of an admin-initiated refund adopts the existing row).
 */

export type StripeRefundResult =
  | { ok: true; refundId: string; amount: number }
  | { ok: false; reason: 'not_stripe_payment' | 'missing_intent' | 'stripe_error'; detail?: string }

export async function createStripeRefund(
  payment: Payment,
  tenant: TenantRow,
  amountCents?: number,
): Promise<StripeRefundResult> {
  if (payment.provider !== 'stripe') return { ok: false, reason: 'not_stripe_payment' }
  if (!payment.provider_payment_intent_id) return { ok: false, reason: 'missing_intent' }

  try {
    const stripe = getStripeClient()
    const refund = await stripe.refunds.create(
      {
        payment_intent: payment.provider_payment_intent_id,
        ...(amountCents !== undefined ? { amount: amountCents } : {}),
        metadata: {
          invoice_id: payment.invoice_id,
          tenant_id: payment.tenant_id,
          ledger_payment_id: payment.id,
        },
      },
      tenant.stripe_account_id ? { stripeAccount: tenant.stripe_account_id } : undefined,
    )
    return { ok: true, refundId: refund.id, amount: refund.amount }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[stripe] refund error for payment ${payment.id}: ${msg}`)
    return { ok: false, reason: 'stripe_error', detail: msg }
  }
}
