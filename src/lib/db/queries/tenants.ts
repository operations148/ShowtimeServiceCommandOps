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
