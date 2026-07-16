# Spec — Invoices, Stripe Connect Payments, Reconciliation (Phase 6)

Completes the invoice UI and production-hardens the existing Stripe direction. One authoritative invoice state machine, an immutable payment ledger, Stripe Connect (Express, direct charge) with server-owned amounts, a secure public pay page, and admin/scheduled reconciliation. Design: ADR-0012 (payment ledger), ADR-0013 (Stripe Connect). Schema: `database-blueprint/payments.md`. No second payment provider; Stripe test mode throughout unless the owner approves live keys.

## Lifecycle

One 12-state machine (`src/lib/invoices/state-machine.ts` + `INVOICE_STATUS_TRANSITIONS` in `src/types/invoice.ts`, 20 tests):

`draft ⇄ ready → sent → viewed → deposit_due → partially_paid → paid`, plus `overdue` (aging), `void` (unpaid only), `refunded`, `credited`. `deposit_paid` is a **legacy** value (pre-Phase-6 rows only) — new code never sets it; the table bridges it out. Editing allowed only in `draft`/`ready`. Void is for unpaid documents only — once money moved, `refund`/`credit` are the paths. `void`/`refunded`/`credited` are terminal.

**Status is derived from the ledger** (`deriveStatusAfterLedgerChange`), never set ad-hoc by payment code: net-paid vs. owed (total − credits) decides partially_paid / paid / refunded / credited.

## Invoice sources

- **Manual authorized entry** — `/dashboard/invoices/new` + `POST /api/invoices`.
- **Accepted estimate** — the Phase 3 `convertEstimateToInvoice` already materialises a draft invoice on acceptance (idempotent via `UNIQUE(invoices.estimate_id)`); unchanged.
- **Work order** — `POST /api/work-orders/[id]/invoices` (standard / milestone / final billing).
- **Approved change order** — `POST /api/change-orders/[id]/invoice` (ACCEPTED only).

Every source path stamps an immutable `source_snapshot` of the source document as it stood at creation. Totals are **always server-computed** from the submitted lines (money module) — a forged client total is structurally impossible (the create/patch schemas don't even accept a total).

## Payment ledger

Immutable append-only `payments` table (ADR-0012). Records payment / refund / credit rows — never mutated after insert (except reconciliation stamps); corrections append offsetting rows. Idempotent by construction: partial unique indexes on `provider_payment_intent_id` (payments), `provider_refund_id`, and `idempotency_key` mean a replayed webhook or double-submit adopts the existing row and never double-records. `applyPayment`/`applyRefund`/`applyCredit` (`src/lib/invoices/apply-payment.ts`) re-aggregate the ledger and write ledger-true sums onto the invoice, so concurrent applications are self-healing. No full card data is ever stored — provider references only.

## Stripe Connect

Express accounts, **direct charge** (tenant is merchant of record, no platform fee). Onboarding (`startConnectOnboarding` → Account Link) + live status (`refreshConnectStatus`, also syncs `charges_enabled`). Checkout sessions (`createInvoiceCheckoutSession`) carry server-owned amount/currency/invoice-id/tenant-id in metadata for deposit **and** balance. Refunds via `createStripeRefund`. Test mode is a property of `STRIPE_SECRET_KEY` — switching to live keys is an explicit owner-approved env change.

## Webhook processing (`/api/stripe/webhook`)

For every event: verify signature → store event receipt + duplicate-check on `event.id` → resolve the tenant from the connected account → verify metadata/amount/currency against the server-resolved invoice (`verifyCheckoutSession`, 9 tests) → apply through the ledger (idempotent) → generic 200. `checkout.session.completed` records a payment; `charge.refunded` records refund rows (handles out-of-order delivery by 500-ing so Stripe retries once the payment landed); `account.updated` syncs charges_enabled. **Terminal vs. transient split**: verification failures are marked done (Stripe stops); DB/ledger errors return 500 so Stripe retries, and rows stuck in `error` are the dead-letter queue reconciliation surfaces.

## Public invoice + payment route

`/invoice/[token]` + `/api/public/invoices/[token]` (view) + `/pay` (checkout). Same security posture as public estimates/change orders — 256-bit hashed token, expiry/revocation, IP rate limits, one generic error (no oracle), tenant derived from the row. Redacted `PublicInvoice` (6-case redaction test) carries no tenant/provider/staff ids or internal notes. Pay deposit / balance / view receipt + payment history.

## API

| Route | Methods | Permission |
|---|---|---|
| `/api/invoices` | GET, POST | canViewInvoices / canManageInvoices |
| `/api/invoices/[id]` | GET, PATCH (version) | view / manage |
| `/api/invoices/[id]/transition` | POST (draft/ready) | manage |
| `/api/invoices/[id]/void` | POST (version, reason) | manage |
| `/api/invoices/[id]/send` | POST (version) | canSendEstimateEmail (rate-limited) |
| `/api/invoices/[id]/revoke-token` | POST | manage |
| `/api/invoices/[id]/activity` | GET | view |
| `/api/invoices/[id]/pdf` | GET | view |
| `/api/invoices/[id]/payments` | GET, POST (manual) | view / manage |
| `/api/invoices/[id]/refund` | POST | canRefundPayments |
| `/api/invoices/[id]/credit` | POST | manage |
| `/api/invoices/[id]/checkout` | POST | manage |
| `/api/work-orders/[id]/invoices` | GET, POST | view / manage |
| `/api/change-orders/[id]/invoice` | POST | manage |
| `/api/settings/stripe/onboard` | POST | canManageSettings |
| `/api/settings/stripe/status` | GET | canManageSettings |
| `/api/public/invoices/[token]` | GET | none (token) — rate-limited, redacted |
| `/api/public/invoices/[token]/pay` | POST | none (token) — server-owned amount |
| `/api/reconciliation/run` | POST | canViewFinancialReports |
| `/api/reconciliation/findings` | GET | canViewFinancialReports |
| `/api/reconciliation/findings/[id]` | PATCH (resolve/ignore + reason) | canViewFinancialReports |
| `/api/cron/reconcile-payments` | GET | CRON_SECRET |

`canViewInvoices` is the new read flag (view/manage split like estimates/change orders). Manage rides existing `canManageInvoices`; refunds `canRefundPayments`; send reuses `canSendEstimateEmail`. Matrix pinned by `src/config/roles.test.ts`.

## Reconciliation

Scheduled (daily cron) or admin-triggered (`runReconciliation`). Cross-checks ledger ⇄ invoice aggregates (amount/status mismatch), ledger ⇄ Stripe (orphaned/account mismatch), folds in overdue aging, and surfaces webhook dead-letter rows. Findings are per-tenant with a mandatory admin resolution reason; runs are platform-wide and audited (`reconciliation_runs`).

## Financial immutability

Invoices, payments, refunds, credits, and approval records are never hard-deleted — void/refund/credit paths only.

## Deliberately out of scope (Phase 6)

- **Second payment provider** — forbidden.
- **Real customer email/charge by default** — send is preview-gated (`ESTIMATE_EMAIL_MODE`); no live card charged in dev/test.
- **Work-order milestone billing UI beyond the manual editor** — the `POST /api/work-orders/[id]/invoices` route + create-from-source exist; a dedicated per-milestone WO-detail form is a follow-up (manual invoice creation covers arbitrary billing today).
- **Reconciliation findings admin screen** — the API (list/resolve) is complete and tested; no dedicated dashboard page ships this phase.

## Tests

Invoice state machine (20), Stripe webhook verification (9), public serializer redaction (6) — plus `qa/payments-test-plan.md` for the flows needing a live DB / Stripe test fixtures (duplicate/out-of-order webhooks, partial payment, refund, reconciliation mismatch, cross-tenant). 311 total suite tests passing.
