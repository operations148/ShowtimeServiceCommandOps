import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'
import { hashToken } from '@/lib/security/tokens'
import { checkPasswordStrength } from '@/lib/security/password-policy'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { recordAuditEvent } from '@/lib/security/audit'
import { bumpSessionVersion } from '@/lib/auth/trusted-context'
import { logger } from '@/lib/security/logger'

export const dynamic = 'force-dynamic'

const ConfirmSchema = z.object({
  token:    z.string().uuid('Invalid reset token'),
  password: z.string().min(8).max(128),
})

export async function POST(request: NextRequest) {
  const limit = await checkRateLimit(getClientIp(request), 'passwordReset')
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = ConfirmSchema.safeParse(body)
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

  // Atomic single-use claim — same race-free pattern as invitation acceptance.
  const { data: claimed, error: claimError } = await db
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id, user_id, tenant_id')
    .maybeSingle()

  if (claimError) {
    logger.error('[password-reset/confirm] claim query failed', { error: claimError.message })
    return NextResponse.json({ error: 'Failed to reset password. Please try again.' }, { status: 500 })
  }

  if (!claimed) {
    return NextResponse.json({ error: 'This password reset link is invalid or has expired.' }, { status: 410 })
  }

  const password_hash = await bcrypt.hash(password, 12)

  const { error: userError } = await db
    .from('users')
    .update({ password_hash, updated_at: new Date().toISOString() })
    .eq('id', claimed.user_id)
    .eq('tenant_id', claimed.tenant_id)

  if (userError) {
    await db.from('password_reset_tokens').update({ used_at: null }).eq('id', claimed.id)
    logger.error('[password-reset/confirm] password update failed', { error: userError.message })
    return NextResponse.json({ error: 'Failed to reset password. Please try again.' }, { status: 500 })
  }

  // Invalidate every session issued before this change — the whole point of
  // a password reset is to cut off anyone who had (or stole) the old one.
  await bumpSessionVersion(claimed.user_id, claimed.tenant_id)

  void recordAuditEvent({
    tenantId: claimed.tenant_id,
    userId: claimed.user_id,
    actionType: 'password.reset_completed',
    description: 'Password reset completed via self-service link',
    entityType: 'user',
    entityId: claimed.user_id,
  })

  return NextResponse.json({ success: true })
}
