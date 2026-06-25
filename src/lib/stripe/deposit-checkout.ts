import { getStripeClient } from './client'
import { db } from '@/lib/db/client'
import type { Invoice } from '@/types/invoice'
import type { TenantRow } from '@/lib/db/types'

export type DepositCheckoutResult =
  | { ok: true;  checkoutUrl: string; sessionId: string }
  | { ok: false; reason: string }

/**
 * Creates a Stripe Checkout Session for the deposit on a connected account
 * (direct charge — tenant is merchant of record, no platform fee).
 *
 * Guard: returns { ok: false } immediately if the tenant's Stripe account
 * is not yet enabled for charges.
 */
export async function createDepositCheckoutSession(
  invoice: Invoice,
  tenant: TenantRow,
): Promise<DepositCheckoutResult> {
  if (!tenant.stripe_charges_enabled || !tenant.stripe_account_id) {
    return {
      ok: false,
      reason:
        'Stripe payments are not enabled for this account. Please complete Stripe Connect onboarding first.',
    }
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const successUrl = `${baseUrl}/estimate/${invoice.public_token}?status=paid`
  const cancelUrl  = `${baseUrl}/estimate/${invoice.public_token}?status=cancelled`

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
                name: `Deposit (10%) — Estimate ${invoice.invoice_number}`,
              },
              unit_amount: invoice.deposit_amount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url:  cancelUrl,
        metadata: {
          invoice_id: invoice.id,
          tenant_id:  invoice.tenant_id,
        },
      },
      { stripeAccount: tenant.stripe_account_id },
    )

    if (!session.url) {
      return { ok: false, reason: 'Stripe returned a session without a checkout URL' }
    }

    // Store the Checkout Session ID on the invoice for later reconciliation.
    // Bypasses the Zod API schema (PatchInvoiceInput) since this is an internal write.
    const { error: patchError } = await db
      .from('invoices')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', invoice.id)
      .eq('tenant_id', invoice.tenant_id)

    if (patchError) {
      console.error(
        `[stripe] deposit-checkout: could not store session ID on invoice ${invoice.id}: ${patchError.message}`,
      )
    }

    return { ok: true, checkoutUrl: session.url, sessionId: session.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[stripe] deposit-checkout error for invoice ${invoice.id}: ${msg}`)
    return { ok: false, reason: msg }
  }
}
