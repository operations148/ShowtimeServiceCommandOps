# Stripe Connect — Operations Runbook (Phase 6)

Operational guide for the invoices/payments system. Non-developer-readable where possible.

## Environment variables

| Variable | Purpose | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Server-side Stripe API key | `sk_test_...` in dev/test, `sk_live_...` only after owner approval. This one key decides test vs. live mode. |
| `STRIPE_WEBHOOK_SECRET` | Verifies inbound webhook signatures | From the Stripe Dashboard → Developers → Webhooks → your endpoint. |
| `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_URL` | Base URL for Checkout success/cancel + public links | |
| `CRON_SECRET` | Protects the reconciliation cron | Already set for other crons. |

Payment features degrade safely if Stripe is unconfigured: the settings panel shows "not connected", public pay buttons hide, and the webhook 500s (Stripe retries) rather than losing data.

## First-time setup

1. **Create the webhook endpoint** in Stripe Dashboard → Developers → Webhooks: point it at `https://<app>/api/stripe/webhook`, listening for `checkout.session.completed`, `charge.refunded`, and `account.updated`. Enable it for **Connected accounts** (Connect events). Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
2. **Each tenant onboards** via Dashboard → Settings → Payments (Stripe Connect) → "Connect Stripe". This is a Stripe-hosted Express onboarding flow; on completion Stripe fires `account.updated` and `charges_enabled` flips on.
3. Confirm status in the same settings panel (it pulls live from Stripe).

## Day-to-day

- **Sending an invoice**: Invoices → open → Send. Preview mode by default (no real email) unless `ESTIMATE_EMAIL_MODE=live`. The customer gets a link to `/invoice/<token>`.
- **Customer pays**: on the public page they tap Pay (deposit or balance) → Stripe Checkout on the tenant's account → returns to `/invoice/<token>?status=paid`. The `checkout.session.completed` webhook records the payment in the ledger and moves the invoice to partially_paid/paid.
- **Recording an offline payment** (check/cash): Invoices → open → Record Payment. Ledger-backed, same as a card payment.
- **Refund**: Invoices → open → in the ledger, Refund a payment (needs the Refund Payments permission). Stripe payments issue a real Stripe refund; the webhook echo is idempotent.
- **Credit adjustment**: Invoices → open → Apply Credit (reduces balance owed without money moving).
- **Void**: only allowed while unpaid. Once money moved, use refund/credit.

## Reconciliation

- Runs daily via cron (`/api/cron/reconcile-payments`, 8am) and on demand via `POST /api/reconciliation/run` (Financial Reports permission).
- It cross-checks the ledger against invoice totals and against Stripe, marks overdue invoices, and files **findings** for anything that disagrees.
- **Resolving a finding**: `GET /api/reconciliation/findings?status=open`, then `PATCH /api/reconciliation/findings/[id]` with a resolution reason. (No dedicated dashboard screen yet — API only this phase.)

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Pay button doesn't appear on the public invoice | Tenant hasn't finished Stripe onboarding (`charges_enabled` false) | Settings → Payments → complete/continue onboarding |
| Webhook events show as `error` in `webhook_events` | Transient DB error or out-of-order delivery | Stripe auto-retries; if persistent, check the `last_error`. Reconciliation surfaces these as dead-letter. |
| Payment succeeded on Stripe but invoice still shows due | Webhook not delivered/verified | Check the Stripe Dashboard webhook log for a 4xx (signature/verification) or 5xx (transient). Re-send the event from the dashboard; the ledger insert is idempotent so re-delivery is safe. |
| Reconciliation flags `amount_mismatch` | Ledger and invoice aggregates disagree | Usually self-heals on the next payment application; if not, inspect the ledger rows for that invoice. Resolve the finding with a reason once verified. |
| Reconciliation flags `account_mismatch` / `orphaned_payment` | A PaymentIntent isn't on the expected connected account, or failed after we recorded it | Investigate in Stripe; the ledger row is marked `mismatch`. |

## Safety rules

- **Never** set `STRIPE_SECRET_KEY` to a live key without explicit owner approval.
- **Never** hard-delete invoices/payments/refunds — use void/refund/credit.
- Re-delivering a Stripe webhook is always safe (idempotent ledger).
- Reconciliation never moves money — it only reads, flags, and marks overdue.
