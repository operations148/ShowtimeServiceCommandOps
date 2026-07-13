import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { generateToken, hashToken } from '@/lib/security/tokens'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { sendPasswordResetEmail } from '@/lib/email/password-reset'
import { recordAuditEvent } from '@/lib/security/audit'
import { logger, maskEmail } from '@/lib/security/logger'

export const dynamic = 'force-dynamic'

const RequestSchema = z.object({
  email: z.string().email('Invalid email address').transform(v => v.toLowerCase().trim()),
})

function genericResponse(): NextResponse {
  return NextResponse.json({
    message: "If an account with that email exists, we've sent password reset instructions.",
  })
}

/**
 * Self-service password reset (security-audit L4 — no self-service flow
 * existed at all, only an admin-driven reset). Always returns the same
 * generic message regardless of whether the email matches an account, to
 * avoid leaking which emails are registered.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = RequestSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: result.error.flatten().fieldErrors },
      { status: 422 }
    )
  }

  const { email } = result.data

  // Rate limit by IP AND by email so neither a single attacker IP nor a
  // targeted-email flood can generate unlimited reset emails.
  const ipLimit = await checkRateLimit(ip, 'passwordReset')
  const emailLimit = await checkRateLimit(email, 'passwordReset')
  if (!ipLimit.allowed || !emailLimit.allowed) {
    // Still return the generic response — don't reveal rate limiting either.
    return genericResponse()
  }

  const { data: user } = await db
    .from('users')
    .select('id, tenant_id, name, email')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle()

  if (!user) {
    logger.info('[password-reset] request for unknown/inactive email', { email: maskEmail(email) })
    return genericResponse()
  }

  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

  const { error: insertError } = await db.from('password_reset_tokens').insert({
    user_id: user.id,
    tenant_id: user.tenant_id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })

  if (insertError) {
    logger.error('[password-reset] token insert failed', { error: insertError.message })
    return genericResponse()
  }

  void sendPasswordResetEmail(user.email, user.name, token).catch(err =>
    logger.error('[password-reset] send failed', { error: err instanceof Error ? err.message : String(err) })
  )

  void recordAuditEvent({
    tenantId: user.tenant_id,
    userId: user.id,
    actionType: 'password.reset_requested',
    description: 'Password reset requested',
    entityType: 'user',
    entityId: user.id,
  })

  return genericResponse()
}
