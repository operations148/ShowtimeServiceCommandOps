import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe/client'
import { getTenantByStripeAccountId } from '@/lib/db/queries/tenants'
import { markDepositPaid, getInvoiceById } from '@/lib/db/queries/invoices'
import { db } from '@/lib/db/client'
import { logger } from '@/lib/security/logger'

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

  // ── Idempotency on event.id ─────────────────────────────────────────────────
  // Stripe's own event.id is a stable, unique identifier (unlike GHL's custom
  // webhook payloads) — dedup on it directly rather than a payload hash.
  const { data: existingEvent } = await db
    .from('webhook_events')
    .select('id, processing_status')
    .eq('provider', 'stripe')
    .eq('event_id', event.id)
    .maybeSingle()

  if (existingEvent?.processing_status === 'done') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (!existingEvent) {
    await db.from('webhook_events').insert({
      provider: 'stripe',
      event_id: event.id,
      processing_status: 'processing',
    })
  }

  async function markProcessed(status: 'done' | 'error', error?: string) {
    await db.from('webhook_events')
      .update({ processing_status: status, processed_at: new Date().toISOString(), last_error: error ?? null })
      .eq('provider', 'stripe').eq('event_id', event.id)
  }

  // All Connect events carry the connected account ID
  const stripeAccountId = event.account
  if (!stripeAccountId) {
    logger.warn('[webhook] event has no account field — ignoring', { eventId: event.id })
    await markProcessed('done')
    return NextResponse.json({ received: true })
  }

  const tenant = await getTenantByStripeAccountId(stripeAccountId)
  if (!tenant) {
    logger.warn('[webhook] no active tenant found for connected account', { eventId: event.id })
    await markProcessed('done')
    return NextResponse.json({ received: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const invoiceId = session.metadata?.invoice_id
        const metadataTenantId = session.metadata?.tenant_id
        const pi = session.payment_intent
        const paymentIntentId = typeof pi === 'string' ? pi : (pi?.id ?? null)

        if (!invoiceId || !paymentIntentId) {
          logger.warn('[webhook] checkout.session.completed missing invoice_id or payment_intent', { sessionId: session.id })
          break
        }

        // Server-owned metadata check — the tenant_id in the session's own
        // metadata (set by us at checkout-session creation) must match the
        // tenant resolved from the connected account. A mismatch means the
        // session was not created for the connected account it's arriving on.
        if (metadataTenantId && metadataTenantId !== tenant.id) {
          logger.error('[webhook] tenant_id mismatch between session metadata and connected account', {
            sessionId: session.id, expectedTenant: tenant.id,
          })
          break
        }

        // Verify amount/currency against the invoice's own deposit_amount
        // rather than trusting the Checkout Session's total blindly (Phase 1:
        // "Verify tenant, connected account, invoice, amount, currency").
        const invoice = await getInvoiceById(invoiceId, tenant.id)
        if (!invoice) {
          logger.warn('[webhook] checkout.session.completed: invoice not found for tenant', { invoiceId, tenantId: tenant.id })
          break
        }
        if (session.currency !== 'usd') {
          logger.error('[webhook] unexpected currency on checkout session', { sessionId: session.id, currency: session.currency })
          break
        }
        if (session.amount_total !== invoice.deposit_amount) {
          logger.error('[webhook] amount mismatch between checkout session and invoice deposit_amount', {
            sessionId: session.id, sessionAmount: session.amount_total, expectedAmount: invoice.deposit_amount,
          })
          break
        }

        const result = await markDepositPaid(invoiceId, paymentIntentId, tenant.id)
        if (!result.ok) {
          if ('invalidTransition' in result) {
            logger.warn('[webhook] markDepositPaid invalid transition', { from: result.from, invoiceId })
          } else {
            logger.warn('[webhook] markDepositPaid invoice not found', { invoiceId, tenantId: tenant.id })
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
          logger.error('[webhook] account.updated tenant patch failed', { tenantId: tenant.id, error: error.message })
        }
        break
      }

      default:
        logger.warn('[webhook] unhandled event type', { eventType: event.type, eventId: event.id })
    }

    await markProcessed('done')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('[webhook] unhandled processing error', { eventId: event.id, error: msg })
    await markProcessed('error', msg)
  }

  return NextResponse.json({ received: true })
}
