import { db } from '@/lib/db/client'
import type { TenantRow } from '@/lib/db/types'

export async function getTenantByStripeAccountId(
  stripeAccountId: string,
): Promise<TenantRow | undefined> {
  const { data, error } = await db
    .from('tenants')
    .select('*')
    .eq('stripe_account_id', stripeAccountId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error(`[db] getTenantByStripeAccountId: ${error.message}`)
  if (!data) return undefined

  return data as unknown as TenantRow
}

export async function getTenantById(tenantId: string): Promise<TenantRow | undefined> {
  const { data, error } = await db
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle()

  if (error) throw new Error(`[db] getTenantById: ${error.message}`)
  if (!data) return undefined

  return data as unknown as TenantRow
}

export async function setTenantStripeAccount(
  tenantId: string,
  patch: {
    stripe_account_id?: string
    stripe_charges_enabled?: boolean
    stripe_onboarding_completed_at?: string | null
  },
): Promise<void> {
  const { error } = await db.from('tenants').update(patch).eq('id', tenantId)
  if (error) throw new Error(`[db] setTenantStripeAccount: ${error.message}`)
}
