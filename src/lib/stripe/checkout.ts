import { getStripeClient } from './client'
import { db } from '@/lib/db/client'
import type { Invoice } from '@/types/invoice'
import type { TenantRow } from '@/lib/db/types'
import { canAcceptPayments } from './connect'

/**
 * Invoice Checkout Sessions on the tenant's connected account (Phase 6,
 * ADR-0013). Direct charge — the tenant is merchant of record.
 *
 * SERVER-OWNED EVERYTHING: the amount, currency, invoice id, and tenant id
 * all come from the invoice row the caller resolved server-side (by admin
 * session or by hashed public token) — the customer's browser supplies
 * nothing but the click. The webhook re-verifies amount, currency, tenant,
 * and connected account against this metadata before recording anything.
 */

export type CheckoutPaymentType = 'deposit' | 'balance'

export type InvoiceCheckoutResult =
  | { ok: true; checkoutUrl: string; sessionId: string; amount: number }
  | { ok: false; reason: 'payments_not_enabled' | 'nothing_due' | 'stripe_error'; detail?: string }

export async function createInvoiceCheckoutSession(
  invoice: Invoice,
  tenant: TenantRow,
  paymentType: CheckoutPaymentType,
  publicToken: string,
): Promise<InvoiceCheckoutResult> {
  if (!canAcceptPayments(tenant)) {
    return { ok: false, reason: 'payments_not_enabled' }
  }

  // Server-owned amount: deposit pays the outstanding deposit portion; balance
  // pays everything still due. Both clamp to amount_due so an almost-settled
  // invoice can never be overcharged.
  const netPaid = Math.max(0, invoice.amount_paid - invoice.amount_refunded)
  let amount: number
  if (paymentType === 'deposit') {
    const depositOutstanding = Math.max(0, invoice.deposit_amount - netPaid)
    amount = Math.min(depositOutstanding, invoice.amount_due)
  } else {
    amount = invoice.amount_due
  }
  if (amount <= 0) return { ok: false, reason: 'nothing_due' }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const successUrl = `${baseUrl}/invoice/${publicToken}?status=paid`
  const cancelUrl = `${baseUrl}/invoice/${publicToken}?status=cancelled`

  try {
    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name:
                  paymentType === 'deposit'
                    ? `Deposit — Invoice ${invoice.invoice_number}`
                    : `Invoice ${invoice.invoice_number}`,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        // The webhook verifies every one of these against the resolved
        // tenant/invoice — forged or mismatched metadata is rejected.
        metadata: {
          invoice_id: invoice.id,
          tenant_id: invoice.tenant_id,
          payment_type: paymentType,
          expected_amount: String(amount),
        },
      },
      { stripeAccount: tenant.stripe_account_id! },
    )

    if (!session.url) {
      return { ok: false, reason: 'stripe_error', detail: 'Stripe returned a session without a checkout URL' }
    }

    // Store the latest session id for reconciliation cross-checks (non-fatal).
    const { error: patchError } = await db
      .from('invoices')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', invoice.id)
      .eq('tenant_id', invoice.tenant_id)
    if (patchError) {
      console.error(`[stripe] checkout: could not store session id on invoice ${invoice.id}: ${patchError.message}`)
    }

    return { ok: true, checkoutUrl: session.url, sessionId: session.id, amount }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[stripe] checkout error for invoice ${invoice.id}: ${msg}`)
    return { ok: false, reason: 'stripe_error', detail: msg }
  }
}
