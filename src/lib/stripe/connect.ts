import { getStripeClient } from './client'
import { getTenantById, setTenantStripeAccount } from '@/lib/db/queries/tenants'
import type { TenantRow } from '@/lib/db/types'

/**
 * Stripe Connect tenant onboarding (Phase 6, ADR-0013).
 *
 * Express accounts, direct charges — the tenant is the merchant of record.
 * Test mode throughout: the mode is a property of STRIPE_SECRET_KEY (sk_test_
 * vs sk_live_); no code path here ever forces live behavior, and switching a
 * deployment to live keys is an explicit owner-approved env change.
 */

export type ConnectOnboardingResult =
  | { ok: true; url: string; accountId: string }
  | { ok: false; reason: string }

/**
 * Creates (or reuses) the tenant's Express account and returns a fresh
 * onboarding Account Link. Idempotent on the tenant's stored account id —
 * re-running onboarding for an incomplete account just mints a new link.
 */
export async function startConnectOnboarding(
  tenantId: string,
  opts: { returnUrl: string; refreshUrl: string },
): Promise<ConnectOnboardingResult> {
  const tenant = await getTenantById(tenantId)
  if (!tenant) return { ok: false, reason: 'Tenant not found' }

  try {
    const stripe = getStripeClient()

    let accountId = tenant.stripe_account_id
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { tenant_id: tenantId },
      })
      accountId = account.id
      await setTenantStripeAccount(tenantId, { stripe_account_id: accountId })
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: opts.returnUrl,
      refresh_url: opts.refreshUrl,
    })

    return { ok: true, url: link.url, accountId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[stripe] connect onboarding failed for tenant ${tenantId}: ${msg}`)
    return { ok: false, reason: msg }
  }
}

export interface ConnectAccountStatus {
  connected: boolean
  accountId: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  /** Stripe's outstanding requirements (currently_due), for the admin UI. */
  requirementsDue: string[]
}

/**
 * Fetches the live account status from Stripe and syncs charges_enabled onto
 * the tenant row (the webhook's account.updated handler does the same — this
 * is the pull path for the admin settings screen).
 */
export async function refreshConnectStatus(tenantId: string): Promise<ConnectAccountStatus> {
  const tenant = await getTenantById(tenantId)
  if (!tenant?.stripe_account_id) {
    return { connected: false, accountId: null, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: [] }
  }

  const stripe = getStripeClient()
  const account = await stripe.accounts.retrieve(tenant.stripe_account_id)

  const chargesEnabled = account.charges_enabled ?? false
  if (chargesEnabled !== tenant.stripe_charges_enabled) {
    await setTenantStripeAccount(tenantId, {
      stripe_charges_enabled: chargesEnabled,
      ...(chargesEnabled && !tenant.stripe_onboarding_completed_at
        ? { stripe_onboarding_completed_at: new Date().toISOString() }
        : {}),
    })
  }

  return {
    connected: true,
    accountId: tenant.stripe_account_id,
    chargesEnabled,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    requirementsDue: account.requirements?.currently_due ?? [],
  }
}

/** Guard used before creating any payment session. */
export function canAcceptPayments(tenant: TenantRow): boolean {
  return !!tenant.stripe_account_id && tenant.stripe_charges_enabled
}
