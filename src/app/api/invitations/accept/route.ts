import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { hashToken } from '@/lib/security/tokens'
import { checkPasswordStrength } from '@/lib/security/password-policy'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { recordAuditEvent } from '@/lib/security/audit'
import { bumpSessionVersion } from '@/lib/auth/trusted-context'
import { logger } from '@/lib/security/logger'

const AcceptSchema = z.object({
  token:    z.string().uuid('Invalid invitation token'),
  password: z.string().min(8).max(128),
})

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(getClientIp(request), 'invitationAccept')
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = AcceptSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: result.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { token, password } = result.data

  const strength = checkPasswordStrength(password)
  if (!strength.ok) {
    return NextResponse.json({ error: strength.reason }, { status: 422 })
  }

  const tokenHash = hashToken(token)

  // Atomic single-use claim (security-audit M12 — the prior SELECT-then-UPDATE
  // flow had a TOCTOU window allowing the same token to be redeemed twice).
  // This UPDATE only affects a row that is still pending and unexpired; a
  // concurrent second request racing on the same token affects zero rows
  // because the winner's UPDATE already set accepted_at.
  const { data: claimed, error: claimError } = await db
    .from('user_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id, user_id, tenant_id')
    .maybeSingle()

  if (claimError) {
    logger.error('[invitations/accept] claim query failed', { error: claimError.message })
    return NextResponse.json({ error: 'Failed to accept invitation. Please try again.' }, { status: 500 })
  }

  if (!claimed) {
    // The claim UPDATE matched nothing — read back why, for an accurate
    // (not identical) error message. This read is not itself the security
    // boundary; the UPDATE above already was.
    const { data: existing } = await db
      .from('user_invitations')
      .select('accepted_at, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Invalid or expired invitation link' }, { status: 404 })
    }
    if (existing.accepted_at) {
      return NextResponse.json({ error: 'This invitation has already been used' }, { status: 410 })
    }
    return NextResponse.json(
      { error: 'This invitation link has expired. Please ask your admin to send a new one.' },
      { status: 410 }
    )
  }

  const password_hash = await bcrypt.hash(password, 12)

  const { error: userError } = await db
    .from('users')
    .update({ password_hash, is_active: true, updated_at: new Date().toISOString() })
    .eq('id', claimed.user_id)
    .eq('tenant_id', claimed.tenant_id)

  if (userError) {
    // Roll back the claim so a transient DB failure doesn't permanently burn
    // the invite the user just tried to redeem.
    await db.from('user_invitations').update({ accepted_at: null }).eq('id', claimed.id)
    logger.error('[invitations/accept] user activation failed', { error: userError.message })
    return NextResponse.json({ error: 'Failed to activate account. Please try again.' }, { status: 500 })
  }

  await bumpSessionVersion(claimed.user_id, claimed.tenant_id)

  void recordAuditEvent({
    tenantId: claimed.tenant_id,
    userId: claimed.user_id,
    actionType: 'invitation.accepted',
    description: 'User accepted invitation and activated account',
    entityType: 'user',
    entityId: claimed.user_id,
  })

  return NextResponse.json({ success: true })
}
