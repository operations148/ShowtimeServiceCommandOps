import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { requirePermission, getTenantId } from '@/lib/auth/api-auth'
import { db } from '@/lib/db/client'
import { bumpSessionVersion } from '@/lib/auth/trusted-context'
import { recordAuditEvent } from '@/lib/security/audit'
import { checkPasswordStrength } from '@/lib/security/password-policy'
import type { TeamMember } from '@/types/team'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission('canManageSettings')
  if (!auth.ok) return auth.response
  const tenantId = getTenantId(auth.session)
  const { id } = await params

  // Self-protection
  if (auth.session.user.id === id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  }

  const { data: existing } = await db
    .from('users')
    .select('id, is_active')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .not('role', 'eq', 'technician')
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  if (existing.is_active) {
    return NextResponse.json({ error: 'Deactivate the member before deleting' }, { status: 400 })
  }

  const { error } = await db
    .from('users')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[api] DELETE /api/team/[id] failed:', error)
    return NextResponse.json({ error: 'Failed to delete team member' }, { status: 500 })
  }

  void recordAuditEvent({
    tenantId, userId: auth.session.user.id, actionType: 'user.deleted',
    description: 'Deleted team member', entityType: 'user', entityId: id,
  })

  return NextResponse.json({ success: true })
}

const TEAM_ROLES = ['tenant_admin', 'office_staff', 'read_only_owner'] as const

const PatchTeamMemberSchema = z.object({
  name:         z.string().min(2).max(120).transform(v => v.trim()).optional(),
  email:        z.string().email().transform(v => v.toLowerCase().trim()).optional(),
  phone:        z.string().max(30).transform(v => v.trim()).nullable().optional(),
  role:         z.enum(TEAM_ROLES).optional(),
  is_active:    z.boolean().optional(),
  new_password: z.string().min(8).max(128).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission('canManageSettings')
  if (!auth.ok) return auth.response
  const tenantId = getTenantId(auth.session)
  const { id } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = PatchTeamMemberSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: result.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { data: existing } = await db
    .from('users')
    .select('id, email, role, is_active')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .not('role', 'eq', 'technician')
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
  }

  const { name, email, phone, role, is_active, new_password } = result.data

  if (new_password) {
    const strength = checkPasswordStrength(new_password)
    if (!strength.ok) {
      return NextResponse.json({ error: strength.reason }, { status: 422 })
    }
  }

  if (email && email !== existing.email) {
    const { data: conflict } = await db
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', email)
      .maybeSingle()
    if (conflict) {
      return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 })
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (email !== undefined) updates.email = email
  if (phone !== undefined) updates.phone = phone
  if (role !== undefined) updates.role = role
  if (is_active !== undefined) updates.is_active = is_active
  if (new_password) updates.password_hash = await bcrypt.hash(new_password, 12)

  const { data: updated, error: updateError } = await db
    .from('users')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id, tenant_id, name, email, phone, role, is_active, created_at')
    .single()

  if (updateError) {
    console.error('[api] PATCH /api/team/[id] failed:', updateError)
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 })
  }

  // Bump session_version whenever role, active state, or password changes —
  // any already-issued JWT for this user is invalidated on its next request
  // (security-audit H2 — deactivation/role changes previously had no effect
  // until the 8h JWT naturally expired).
  if (role !== undefined || is_active !== undefined || new_password) {
    await bumpSessionVersion(id, tenantId)
  }

  if (role !== undefined && role !== existing.role) {
    void recordAuditEvent({
      tenantId, userId: auth.session.user.id, actionType: 'user.role_changed',
      description: `Changed role from ${existing.role} to ${role}`,
      entityType: 'user', entityId: id,
    })
  }
  if (is_active !== undefined && is_active !== existing.is_active) {
    void recordAuditEvent({
      tenantId, userId: auth.session.user.id,
      actionType: is_active ? 'user.reactivated' : 'user.deactivated',
      description: is_active ? 'Reactivated team member' : 'Deactivated team member',
      entityType: 'user', entityId: id,
    })
  }
  if (new_password) {
    void recordAuditEvent({
      tenantId, userId: auth.session.user.id, actionType: 'password.admin_reset',
      description: 'Admin reset team member password',
      entityType: 'user', entityId: id,
    })
  }

  return NextResponse.json({ data: updated as TeamMember })
}
