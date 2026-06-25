import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe/client'
import { getTenantByStripeAccountId } from '@/lib/db/queries/tenants'
import { markDepositPaid } from '@/lib/db/queries/invoices'
import { db } from '@/lib/db/client'

// Stripe signature verification requires the raw body and Node.js crypto
export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature') ?? ''
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = getStripeClient().webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[webhook] signature verification failed: ${msg}`)
    return NextResponse.json({ error: `Signature verification failed: ${msg}` }, { status: 400 })
  }

  // All Connect events carry the connected account ID
  const stripeAccountId = event.account
  if (!stripeAccountId) {
    console.warn(`[webhook] event ${event.id} has no account field — ignoring`)
    return NextResponse.json({ received: true })
  }

  const tenant = await getTenantByStripeAccountId(stripeAccountId)
  if (!tenant) {
    console.warn(`[webhook] event ${event.id}: no active tenant found for account ${stripeAccountId}`)
    return NextResponse.json({ received: true })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const invoiceId = session.metadata?.invoice_id
      const pi = session.payment_intent
      const paymentIntentId = typeof pi === 'string' ? pi : (pi?.id ?? null)

      if (!invoiceId || !paymentIntentId) {
        console.warn(
          `[webhook] checkout.session.completed: missing invoice_id or payment_intent in session ${session.id}`,
        )
        break
      }

      const result = await markDepositPaid(invoiceId, paymentIntentId, tenant.id)
      if (!result.ok) {
        if ('invalidTransition' in result) {
          console.warn(
            `[webhook] markDepositPaid: invalid transition from ${result.from} for invoice ${invoiceId}`,
          )
        } else {
          console.warn(
            `[webhook] markDepositPaid: invoice ${invoiceId} not found for tenant ${tenant.id}`,
          )
        }
      }
      break
    }

    case 'account.updated': {
      const account = event.data.object
      const chargesEnabled = account.charges_enabled ?? false

      const patch: Record<string, unknown> = { stripe_charges_enabled: chargesEnabled }
      if (chargesEnabled && !tenant.stripe_onboarding_completed_at) {
        patch.stripe_onboarding_completed_at = new Date().toISOString()
      }

      const { error } = await db
        .from('tenants')
        .update(patch)
        .eq('id', tenant.id)

      if (error) {
        console.error(
          `[webhook] account.updated: failed to update tenant ${tenant.id}: ${error.message}`,
        )
      }
      break
    }

    default:
      console.warn(`[webhook] unhandled event type: ${event.type} (id: ${event.id})`)
  }

  return NextResponse.json({ received: true })
}
