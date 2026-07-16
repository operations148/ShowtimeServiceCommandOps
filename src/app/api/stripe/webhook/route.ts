import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe/client'
import { verifyCheckoutSession } from '@/lib/stripe/verify-event'
import { getTenantByStripeAccountId } from '@/lib/db/queries/tenants'
import { getInvoiceById } from '@/lib/db/queries/invoices'
import { applyPayment, applyRefund } from '@/lib/invoices/apply-payment'
import { db } from '@/lib/db/client'
import { logger } from '@/lib/security/logger'

// Stripe signature verification requires the raw body and Node.js crypto
export const runtime = 'nodejs'

/**
 * Stripe Connect webhook (Phase 6 rewrite, ADR-0012/0013).
 *
 * For every event: verify signature → store/receipt-check the event id
 * (duplicate → done) → resolve the tenant from the connected account →
 * verify metadata/amount/currency against the server-resolved invoice →
 * apply the transition through the ledger (idempotent) → audit → generic 200.
 *
 * Retry/dead-letter: verification failures (forged/mismatched data) are
 * terminal — marked done-with-detail and 200'd so Stripe stops redelivering.
 * TRANSIENT failures (out-of-order events, DB errors) are marked 'error' and
 * returned 500 so Stripe's own retry schedule redelivers; rows stuck in
 * 'error' are the dead-letter queue the reconciliation job surfaces.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''
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
    logger.warn('[webhook] signature verification failed', { error: msg })
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 })
  }

  // ── Event receipt + duplicate check (Stripe event.id is stable/unique) ─────
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
    await db
      .from('webhook_events')
      .update({ processing_status: status, processed_at: new Date().toISOString(), last_error: error ?? null })
      .eq('provider', 'stripe')
      .eq('event_id', event.id)
  }

  // All Connect events carry the connected account id — resolve the tenant
  // from it, never from anything inside the payload.
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
        const pi = session.payment_intent
        const invoiceId = session.metadata?.invoice_id

        // Resolve the invoice UNDER THE RESOLVED TENANT (cross-tenant ids miss).
        const invoice = invoiceId ? await getInvoiceById(invoiceId, tenant.id) : undefined

        const verification = verifyCheckoutSession(
          {
            metadataInvoiceId: session.metadata?.invoice_id,
            metadataTenantId: session.metadata?.tenant_id,
            metadataExpectedAmount: session.metadata?.expected_amount,
            amountTotal: session.amount_total,
            currency: session.currency,
            paymentIntentId: typeof pi === 'string' ? pi : (pi?.id ?? null),
          },
          tenant.id,
          invoice ? { id: invoice.id, tenant_id: invoice.tenant_id } : undefined,
        )

        if (!verification.ok) {
          // Verification failures are terminal — a forged or mismatched
          // session never becomes valid on retry.
          logger.error('[webhook] checkout verification failed', {
            eventId: event.id,
            sessionId: session.id,
            reason: verification.reason,
          })
          await markProcessed('done', `verification: ${verification.reason}`)
          return NextResponse.json({ received: true })
        }

        const result = await applyPayment({
          invoiceId: verification.invoiceId,
          tenantId: tenant.id,
          amount: verification.amount,
          provider: 'stripe',
          providerAccountId: stripeAccountId,
          providerPaymentIntentId: verification.paymentIntentId,
          providerCheckoutSessionId: session.id,
          eventSource: 'webhook',
          metadata: { payment_type: session.metadata?.payment_type ?? null, stripe_event_id: event.id },
        })

        if (!result.ok) {
          if (result.reason === 'not_payable') {
            // Money genuinely moved on Stripe but the invoice can't take it
            // (e.g. voided since). Terminal here; reconciliation surfaces it.
            logger.error('[webhook] payment arrived for non-payable invoice', {
              invoiceId: verification.invoiceId,
              detail: result.detail,
            })
            await markProcessed('done', `not_payable: ${result.detail}`)
            return NextResponse.json({ received: true })
          }
          // Transient (ledger/DB error) — let Stripe retry.
          throw new Error(`applyPayment failed: ${result.reason} ${result.detail ?? ''}`)
        }
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object
        const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
        if (!piId) {
          await markProcessed('done', 'charge.refunded without payment_intent')
          return NextResponse.json({ received: true })
        }

        // Find the ledger payment row this refund reverses.
        const { data: paymentRow } = await db
          .from('payments')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('provider_payment_intent_id', piId)
          .eq('kind', 'payment')
          .maybeSingle()

        if (!paymentRow) {
          // Out-of-order delivery (refund before its payment event) — mark
          // transient and 500 so Stripe redelivers once the payment landed.
          throw new Error(`refund arrived before ledger payment for intent ${piId}`)
        }

        const payment = paymentRow as unknown as { id: string; invoice_id: string }
        // A charge can carry multiple partial refunds — record each once.
        for (const refund of charge.refunds?.data ?? []) {
          const result = await applyRefund({
            invoiceId: payment.invoice_id,
            tenantId: tenant.id,
            refundedPaymentId: payment.id,
            amount: refund.amount,
            provider: 'stripe',
            providerRefundId: refund.id,
            providerAccountId: stripeAccountId,
            reason: refund.reason ?? 'stripe refund',
            eventSource: 'webhook',
          })
          if (!result.ok && result.reason === 'ledger_error') {
            throw new Error(`applyRefund failed: ${result.detail}`)
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

        const { error } = await db.from('tenants').update(patch).eq('id', tenant.id)
        if (error) {
          throw new Error(`account.updated tenant patch failed: ${error.message}`)
        }
        break
      }

      default:
        logger.warn('[webhook] unhandled event type', { eventType: event.type, eventId: event.id })
    }

    await markProcessed('done')
    return NextResponse.json({ received: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('[webhook] transient processing error — Stripe will retry', { eventId: event.id, error: msg })
    await markProcessed('error', msg)
    // Non-2xx → Stripe redelivers on its retry schedule; rows stuck in
    // 'error' are surfaced by the reconciliation job (dead-letter).
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
