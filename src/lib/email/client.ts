import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === 'production') {
  console.warn('[email] RESEND_API_KEY is not set — emails will not be sent')
}

export const resend = new Resend(process.env.RESEND_API_KEY ?? 'dummy_key_for_build')
