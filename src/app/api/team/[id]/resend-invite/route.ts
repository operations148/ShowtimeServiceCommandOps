import { type NextRequest, NextResponse } from 'next/server'
import { requirePermission, getTenantId } from '@/lib/auth/api-auth'
import { db } from '@/lib/db/client'
import { sendInviteEmail } from '@/lib/email/invite'
import type { TeamMemberRole } from '@/types/team'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission('canManageSettings')
  if (!auth.ok) return auth.response
  const tenantId = getTenantId(auth.session)
  const { id } = await params

  const { data: member } = await db
    .from('users')
    .select('id, name, email, role, is_active, tenant_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .not('role', 'eq', 'technician')
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  if (member.is_active) {
    return NextResponse.json({ error: 'Member is already active — no invite needed' }, { status: 400 })
  }

  // Expire any existing unaccepted invitations
  await db
    .from('user_invitations')
    .update({ expires_at: new Date().toISOString() })
    .eq('user_id', id)
    .is('accepted_at', null)

  // Create a fresh invitation token
  const { data: invite, error: inviteError } = await db
    .from('user_invitations')
    .insert({ user_id: id, tenant_id: tenantId })
    .select('token')
    .single()

  if (inviteError || !invite) {
    console.error('[api] resend-invite: failed to create token:', inviteError)
    return NextResponse.json({ error: 'Failed to generate invite token' }, { status: 500 })
  }

  const { data: tenant } = await db
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .maybeSingle()

  const companyName = tenant?.name ?? 'ServiceOps'

  void sendInviteEmail(member.email, member.name, member.role as TeamMemberRole, companyName, invite.token as string)
    .catch(err => console.error('[email] resend-invite failed:', err))

  return NextResponse.json({ success: true })
}
