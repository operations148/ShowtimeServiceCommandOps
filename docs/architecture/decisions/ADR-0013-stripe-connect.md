# ADR-0013 — Stripe Connect (Express, Direct Charge) and Server-Owned Amounts

**Status:** Accepted (Phase 6, 2026-07-13)

## Context

ServiceOps is multi-tenant: each tenant is an independent service business that needs to collect its own customers' card payments into its own bank account. The platform must never be the merchant of record for a tenant's jobs, must never touch a tenant's payout balance, and must be safe against a customer's browser tampering with what they're charged. This ADR fixes how Stripe is wired.

## Decisions

### 1. Stripe Connect Express accounts, direct charge

Each tenant onboards a Stripe **Express** connected account; charges are created **directly on the connected account** (`stripeAccount: acct_...`), making the tenant the merchant of record with no platform fee. The platform's Stripe account facilitates onboarding and receives webhooks but never holds the money. Onboarding is an Account Link the admin completes; `charges_enabled` gates whether payment UI appears at all (`canAcceptPayments`).

### 2. The customer's browser supplies nothing but the click

Every amount, currency, invoice id, and tenant id in a Checkout Session comes from the invoice row the server resolved (by admin session or by hashed public token). The public pay route (`/api/public/invoices/[token]/pay`) takes only a `payment_type` (`deposit` | `balance`); the amount is computed server-side and clamped to `amount_due`. There is no path for the client to propose a price. This is the single most important payment-security property and it's enforced by simply never reading an amount from the request body.

### 3. The webhook re-verifies everything against server-resolved rows

`verifyCheckoutSession` (pure, 9 tests) rejects a completed session unless: the metadata is present, the metadata tenant matches the tenant resolved *from the connected account the event arrived on*, the invoice exists under that tenant, the currency is usd, and the charged total equals the server-stamped `expected_amount`. Forged metadata, a session that arrived on the wrong connected account, a wrong currency, or a tampered amount all fail. The trust root is (a) the connected account on the event and (b) the invoice fetched with that tenant's id — everything inside the session object is attacker-controllable until it matches those.

### 4. Terminal vs. transient webhook failures are distinguished

Verification failures (forged/mismatched data, or a payment for an invoice that's since been voided) are **terminal** — the row is marked done and the endpoint returns 200 so Stripe stops redelivering. Genuinely transient failures (an out-of-order refund whose payment hasn't landed, a DB error) return **500** so Stripe's own at-least-once retry redelivers, and rows stuck in `error` become the dead-letter queue the reconciliation job surfaces. This keeps Stripe's retry machinery working *for* us on transient problems without infinite-looping on unfixable ones.

### 5. Refunds issue the provider refund first, then the ledger echoes idempotently

An admin refund calls Stripe's refund API on the connected account, then records a ledger refund row. The subsequent `charge.refunded` webhook echo is idempotent via the unique `provider_refund_id` — whichever arrives second adopts the existing row. So an admin-initiated refund and its webhook echo can never double-count. (See ADR-0012 for the ledger idempotency mechanics.)

### 6. Test mode is the key, not the code

Whether the system is in test or live mode is entirely a property of `STRIPE_SECRET_KEY` (`sk_test_` vs `sk_live_`). No code path forces or assumes live behavior; switching a deployment to live is an explicit, owner-approved environment-variable change — consistent with the standing rule that real charges require approval. Development and CI use test keys / mocks and never charge a live card.

## Alternatives considered

- **Destination charges / platform-as-merchant** — rejected; the platform would become merchant of record for every tenant's jobs and sit in the money flow, which is neither the product model (white-label, tenant owns the customer relationship) nor a liability we want.
- **Standard Connect accounts** — Express is the right fit for the target user (small service businesses); Standard pushes more dashboard/compliance surface onto the tenant than needed.
- **Trusting Checkout Session metadata without re-resolving the tenant from the connected account** — rejected; metadata is set by us but arrives back through an attacker-reachable surface, so it must be checked against the connected account, not trusted on its own.
- **Storing a Stripe payment link on the invoice and reusing it** — rejected in favour of minting a fresh Checkout Session per pay action with a server-computed amount, so a stale link can't charge an outdated total.

## Consequences

- Tenants collect into their own accounts; the platform never holds tenant funds or acts as merchant of record.
- A customer cannot influence what they're charged — the amount is always server-owned and clamped to what's due.
- Webhook processing is idempotent, order-tolerant, and self-documenting about which failures are retryable, with reconciliation as the backstop.
- Going live is a deliberate credential change, never an accidental code behavior.
