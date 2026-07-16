# Phase 6 Memory — Invoices, Stripe Connect Payments, Ledger, Reconciliation

_Completed 2026-07-13 on branch `feat/serviceops-phase-6-invoices-payments` (off Phase 5, with master's hotfixes merged in). Rationale in ADR-0012 (payment ledger) + ADR-0013 (Stripe Connect); spec `specs/invoices-and-payments.md`; schema `database-blueprint/payments.md`; runbook `docs/operations/stripe-runbook.md`; test plan `qa/payments-test-plan.md`._

## What was built

Completed the invoice UI and production-hardened the Stripe direction. Consolidated the old 5-state invoice model into a 12-state machine, added an immutable payment ledger with ledger-derived invoice status, Stripe Connect (Express, direct charge) with server-owned amounts, a secure public pay page, and admin/scheduled reconciliation. Migration `20260714000001` — additive, **NOT applied to the live DB yet** (Phase 6 not deployed; awaiting approval).

## Reusable primitives / decisions

- **Ledger is truth, aggregates are derived** (ADR-0012): `applyPayment/Refund/Credit` append an idempotent ledger row then rewrite ledger-true sums onto the invoice — never `+=`. Concurrent/replayed events self-heal. Reuse this shape for any future money-movement surface.
- **Structural idempotency**: partial unique indexes on `provider_payment_intent_id` / `provider_refund_id` / `idempotency_key` — the DB is the concurrency primitive, not app locks.
- **Status is a pure function** (`deriveStatusAfterLedgerChange`), gated by the state machine for reachability. Payment code never sets a status literal.
- **Server-owned amounts** (ADR-0013): the public pay route reads only `payment_type`; amount/currency/tenant/invoice all come from the server-resolved row. `verifyCheckoutSession` (pure, tested) re-checks the webhook against the tenant resolved from the connected account.
- **Terminal vs. transient webhook split**: verification failures → done+200 (Stripe stops); DB/ledger errors → 500 (Stripe retries); stuck `error` rows are the dead-letter reconciliation surfaces.
- **Shared public-token + PublicX redaction + safe mailer + pdfText** all reused from Phases 3/5 (`src/lib/security/public-document-token.ts`, allowlist `PublicInvoice`, `safeSend`, `src/lib/pdf/pdf-text.ts`).

## Bugs / gaps found and fixed incidentally

- **`tenants.logo_url` migration gap** (`20260714000003`): read/written by company settings + estimate/change-order/invoice send, but never in a tracked migration (hand-added on the original DB, same class as Phase 5's found gaps and the `users.avatar_url` fix). **Applied to production** this session so the currently-live app's branding lookups work.
- (Earlier same session, not Phase 6 code but related: `users.avatar_url` `20260714000002` — the login-breaking gap.)

## Permissions

New `canViewInvoices` read flag (view/manage split). Manage rides existing `canManageInvoices`; refunds `canRefundPayments`; send reuses `canSendEstimateEmail`; Stripe onboarding rides `canManageSettings`; reconciliation `canViewFinancialReports`. Matrix pinned in `roles.test.ts`.

## Deferred (documented, not gate blockers)

Second payment provider (forbidden); real email/charge by default (preview-gated); dedicated work-order milestone-billing UI (API + create-from-source exist; manual editor covers arbitrary billing); reconciliation-findings admin screen (API complete + tested, no page yet).

## Verification gaps (flagged)

Concurrency, duplicate/out-of-order webhooks, partial payment, refund, reconciliation-mismatch, cross-tenant, rate-limit checks need a live DB + Stripe test fixtures — no test DB or Stripe harness in CI (same gap as Phases 2–5). Admin + public UI are typecheck + production-build verified, not browser-tested. `qa/payments-test-plan.md`. Test count: 311 total (added Phase 6: invoice state machine 20, webhook verification 9, public serializer redaction 6, + roles matrix rows). **No live card ever charged.**

## Deploy status

Branch NOT merged to master, NOT deployed. To ship: merge to master, apply migration `20260714000001` (+ `...0002`/`...0003` if not already), set `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (test keys) + the Stripe webhook endpoint, then deploy. The daily reconcile-payments cron is already in `vercel.json`.
