import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { requireApiAuth, requirePermission, getTenantId } from '@/lib/auth/api-auth'
import { db } from '@/lib/db/client'
import { sendInviteEmail } from '@/lib/email/invite'
import { generateToken, hashToken } from '@/lib/security/tokens'
import { recordAuditEvent } from '@/lib/security/audit'
import type { TeamMember } from '@/types/team'

const TEAM_ROLES = ['tenant_admin', 'office_staff', 'read_only_owner'] as const

const CreateTeamMemberSchema = z.object({
  name:  z.string().min(2, 'Name must be at least 2 characters').max(120).transform(v => v.trim()),
  email: z.string().email('Enter a valid email address').transform(v => v.toLowerCase().trim()),
  phone: z.string().max(30).transform(v => v.trim()).optional(),
  role:  z.enum(TEAM_ROLES, { message: 'Invalid role' }),
})

export async function GET() {
  const auth = await requireApiAuth()
  if (!auth.ok) return auth.response
  const tenantId = getTenantId(auth.session)

  const { data, error } = await db
    .from('users')
    .select('id, tenant_id, name, email, phone, role, is_active, created_at')
    .eq('tenant_id', tenantId)
    .in('role', [...TEAM_ROLES, 'platform_owner'])
    .order('name', { ascending: true })

  if (error) {
    console.error('[api] GET /api/team failed:', error)
    return NextResponse.json({ data: [] })
  }

  return NextResponse.json({ data: (data ?? []) as TeamMember[] })
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission('canManageSettings')
  if (!auth.ok) return auth.response
  const tenantId = getTenantId(auth.session)

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = CreateTeamMemberSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: result.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { name, email, phone, role } = result.data

  // Check for duplicate email within tenant
  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 })
  }

  // Create inactive user with unusable random password hash
  const unusableHash = randomBytes(32).toString('hex')

  const { data: newMember, error: insertError } = await db
    .from('users')
    .insert({
      tenant_id:     tenantId,
      name,
      email,
      phone:         phone ?? null,
      role,
      password_hash: unusableHash,
      is_active:     false,
    })
    .select('id, tenant_id, name, email, phone, role, is_active, created_at')
    .single()

  if (insertError) {
    console.error('[api] POST /api/team failed:', insertError)
    return NextResponse.json({ error: 'Failed to create team member' }, { status: 500 })
  }

  // Create invite token — generated here, only the hash is persisted
  // (security-audit M11: the token was previously stored/compared in plaintext).
  const token = generateToken()
  const tokenHash = hashToken(token)

  const { data: invite, error: inviteError } = await db
    .from('user_invitations')
    .insert({ user_id: newMember.id, tenant_id: tenantId, token_hash: tokenHash })
    .select('id')
    .single()

  if (inviteError || !invite) {
    console.error('[api] POST /api/team invite creation failed:', inviteError)
    // Don't fail the request — user is created, admin can resend invite later
  } else {
    // Get company name for the email
    const { data: tenant } = await db
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle()

    const companyName = tenant?.name ?? 'ServiceOps'

    // Fire-and-forget — never block the 201 response for email failures
    void sendInviteEmail(email, name, role, companyName, token).catch(err =>
      console.error('[email] invite send failed:', err)
    )

    void recordAuditEvent({
      tenantId,
      userId: auth.session.user.id,
      actionType: 'invitation.created',
      description: `Invited ${email} as ${role}`,
      entityType: 'user',
      entityId: newMember.id,
    })
  }

  return NextResponse.json({ data: newMember as TeamMember }, { status: 201 })
}
