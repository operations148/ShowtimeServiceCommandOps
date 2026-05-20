import { type NextRequest, NextResponse } from 'next/server'
import { requirePermission, getTenantId } from '@/lib/auth/api-auth'
import { invalidateCache } from '@/lib/ghl/reporting-cache'

export async function POST(_req: NextRequest) {
  const auth = await requirePermission('canViewReports')
  if (!auth.ok) return auth.response

  const tenantId = getTenantId(auth.session)

  invalidateCache(`owner:${tenantId}`)
  invalidateCache(`marketing:${tenantId}`)

  return NextResponse.json({
    success: true,
    message: 'Reporting cache cleared — next load fetches fresh GHL data',
  })
}
