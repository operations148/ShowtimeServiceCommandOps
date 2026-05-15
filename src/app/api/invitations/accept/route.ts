import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db/client'

const AcceptSchema = z.object({
  token:    z.string().uuid('Invalid invitation token'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

export async function POST(request: NextRequest) {
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

  // Look up the invitation
  const { data: invite, error: inviteError } = await db
    .from('user_invitations')
    .select('id, user_id, tenant_id, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()

  if (inviteError || !invite) {
    return NextResponse.json({ error: 'Invalid or expired invitation link' }, { status: 404 })
  }

  if (invite.accepted_at) {
    return NextResponse.json({ error: 'This invitation has already been used' }, { status: 410 })
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation link has expired. Please ask your admin to send a new one.' }, { status: 410 })
  }

  const password_hash = await bcrypt.hash(password, 12)

  // Activate the user account
  const { error: userError } = await db
    .from('users')
    .update({ password_hash, is_active: true, updated_at: new Date().toISOString() })
    .eq('id', invite.user_id)
    .eq('tenant_id', invite.tenant_id)

  if (userError) {
    console.error('[api] POST /api/invitations/accept user update failed:', userError)
    return NextResponse.json({ error: 'Failed to activate account. Please try again.' }, { status: 500 })
  }

  // Mark invitation as accepted
  await db
    .from('user_invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return NextResponse.json({ success: true })
}
