/**
 * Pure verification of Stripe checkout webhook payloads against the
 * server-resolved tenant + invoice (Phase 6, ADR-0013). Extracted from the
 * webhook route so the security-critical rejections (forged metadata, wrong
 * connected account, wrong currency, wrong amount) are unit-testable without
 * Stripe fixtures.
 *
 * Trust model: the ONLY trusted inputs are (a) the tenant resolved from the
 * event's connected-account id and (b) the invoice row fetched with that
 * tenant's id. Everything inside the session object (including its metadata,
 * which we set at creation) is treated as attacker-controllable until it
 * matches the resolved rows.
 */

export interface CheckoutSessionFacts {
  metadataInvoiceId: string | null | undefined
  metadataTenantId: string | null | undefined
  metadataExpectedAmount: string | null | undefined
  amountTotal: number | null | undefined
  currency: string | null | undefined
  paymentIntentId: string | null | undefined
}

export interface ResolvedInvoiceFacts {
  id: string
  tenant_id: string
}

export type CheckoutVerification =
  | { ok: true; invoiceId: string; amount: number; paymentIntentId: string }
  | {
      ok: false
      reason:
        | 'missing_metadata'
        | 'missing_payment_intent'
        | 'tenant_mismatch'
        | 'invoice_not_found'
        | 'invoice_tenant_mismatch'
        | 'currency_mismatch'
        | 'amount_mismatch'
    }

export function verifyCheckoutSession(
  session: CheckoutSessionFacts,
  resolvedTenantId: string,
  invoice: ResolvedInvoiceFacts | undefined,
): CheckoutVerification {
  if (!session.metadataInvoiceId || !session.metadataTenantId || !session.metadataExpectedAmount) {
    return { ok: false, reason: 'missing_metadata' }
  }
  if (!session.paymentIntentId) {
    return { ok: false, reason: 'missing_payment_intent' }
  }

  // Forged/mismatched tenant: the metadata tenant must be the tenant that
  // owns the connected account the event arrived on.
  if (session.metadataTenantId !== resolvedTenantId) {
    return { ok: false, reason: 'tenant_mismatch' }
  }

  // The invoice must exist under that tenant (cross-tenant invoice ids 404).
  if (!invoice) return { ok: false, reason: 'invoice_not_found' }
  if (invoice.tenant_id !== resolvedTenantId || invoice.id !== session.metadataInvoiceId) {
    return { ok: false, reason: 'invoice_tenant_mismatch' }
  }

  if ((session.currency ?? '').toLowerCase() !== 'usd') {
    return { ok: false, reason: 'currency_mismatch' }
  }

  // The session's charged total must equal the server-owned amount we stamped
  // into the metadata at creation — a session created outside our checkout
  // path (or tampered with) can never satisfy both sides of this equality.
  const expected = Number.parseInt(session.metadataExpectedAmount, 10)
  if (!Number.isFinite(expected) || expected <= 0 || session.amountTotal !== expected) {
    return { ok: false, reason: 'amount_mismatch' }
  }

  return {
    ok: true,
    invoiceId: invoice.id,
    amount: expected,
    paymentIntentId: session.paymentIntentId,
  }
}
