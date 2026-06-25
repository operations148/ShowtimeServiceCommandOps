import Stripe from 'stripe'

let _client: Stripe | undefined

export function getStripeClient(): Stripe {
  if (!_client) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('[stripe] STRIPE_SECRET_KEY is not configured')
    _client = new Stripe(key, { apiVersion: '2026-05-27.dahlia' })
  }
  return _client
}
