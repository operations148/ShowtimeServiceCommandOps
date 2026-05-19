import { Resend } from 'resend'

// Lazy singleton — instantiated on first call so the module can be imported
// at build time without throwing when RESEND_API_KEY is not set.
let _client: Resend | null = null

export function getResend(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not configured. Add it to Vercel env vars.')
    _client = new Resend(key)
  }
  return _client
}
