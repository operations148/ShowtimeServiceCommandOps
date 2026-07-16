# Payments Test Plan — Phase 6

Maps the Phase-6 required test list to concrete verification. Unit-tested items are automated (Vitest); the rest are manual steps against a deployed preview with the migration applied and Stripe **test** keys configured. Use Stripe test fixtures/mocks — never charge a live card.

| # | Test | Automated? | Verification |
|---|---|---|---|
| 1 | Invoice state machine | Yes (`state-machine.test.ts`, 20) | Illegal transitions rejected; paid never voids; ready↔draft; legacy deposit_paid bridges out, nothing targets it. |
| 2 | Ledger-derived status | Yes (`state-machine.test.ts`) | `deriveStatusAfterLedgerChange` → partially_paid/paid/refunded/credited across payment/refund/credit combos. |
| 3 | Overdue eligibility | Yes (`state-machine.test.ts`) | Open + past due → eligible; paid/void/draft/future/missing-date → not; already-overdue not re-flagged. |
| 4 | Stripe webhook verification | Yes (`verify-event.test.ts`, 9) | Rejects missing metadata, wrong tenant/account, missing invoice, wrong currency, forged amount; accepts consistent + case-insensitive currency. |
| 5 | Public serializer redaction | Yes (`public-serializer.test.ts`, 6) | Serialized JSON carries no tenant/provider/staff/ledger-number/GHL values; failed payments excluded. |
| 6 | Permission matrix | Yes (`roles.test.ts`, Phase 6 block) | canViewInvoices/canManageInvoices/canRefundPayments/canManageSettings pinned per role. |
| 7 | Tenant-safe numbering concurrency | No | Fire concurrent invoice + payment creates; confirm distinct INV-/PAY- numbers (document_sequences, no dupes). |
| 8 | Source snapshot immutability | No | Create an invoice from a work order/change order; edit the source; confirm `source_snapshot` unchanged. |
| 9 | Server-owned totals | Partial (schema) + manual | POST/PATCH an invoice; totals derive from lines only (no client total accepted). Confirm response totals = server compute. |
| 10 | Forged client amount | No | On the public pay route, attempt to influence the amount via the body — only `payment_type` is read; the Checkout amount = server `amount_due`/deposit. |
| 11 | Forged Stripe metadata | Yes (`verify-event.test.ts`) + manual | A checkout session with a mismatched tenant/amount in metadata → webhook records nothing, marks done with reason. |
| 12 | Wrong connected account | Yes (unit) + manual | Event on Tenant B's account carrying Tenant A metadata → tenant_mismatch, no ledger row. |
| 13 | Wrong currency | Yes (unit) + manual | Non-usd session → currency_mismatch, no ledger row. |
| 14 | Duplicate webhook | No | Re-send `checkout.session.completed` from the Stripe dashboard → second is `{duplicate:true}`, ledger has one payment row, invoice paid once. |
| 15 | Out-of-order webhook | No | Deliver `charge.refunded` before its payment event → 500 (Stripe retries); after the payment lands, retry succeeds and records the refund. |
| 16 | Partial payment | No | Pay less than the balance → status partially_paid, amount_due reduced by exactly the payment. |
| 17 | Refund | No | Refund a payment → Stripe refund created, ledger refund row, invoice recomputed (partially_paid or refunded); webhook echo is idempotent (no double row). |
| 18 | Void | No | Void an unpaid invoice → status void, token revoked; attempt to void a paid invoice → 409 (use refund/credit). |
| 19 | Reconciliation mismatch | No | Manually corrupt an invoice aggregate vs. its ledger; run reconciliation → `amount_mismatch` finding; resolve with a reason → status resolved. |
| 20 | Public token | No | Set `token_expires_at` in the past → public GET → generic 404. Revoke → generic 404. |
| 21 | Cross-tenant invoice | No | Tenant B requesting Tenant A's invoice (`GET /api/invoices/[id]`) → 404. Public token minted for A never resolves under B (tenant derived from the row). |
| 22 | Rate limiting | No | `GET /api/public/invoices/[token]` >30×/min from one IP → 429; pay attempts >10/hr → 429. |
| 23 | PDF escaping | Yes (`pdf-text.test.ts`) + manual | Hostile title/notes with control chars → PDF renders sanitized, no corruption. |
| 24 | Audit events | No | Each action (create/send/void/payment/refund/credit/stripe onboard/reconcile) writes a `user_activity_log` row + an `invoice_events` row where applicable. |
| 25 | Deposit vs. balance pay | No | Deposit-required invoice → public page shows both "Pay Deposit" and "Pay Balance"; deposit charges only the outstanding deposit portion. |
| 26 | Stripe not onboarded | No | Tenant without `charges_enabled` → public pay button hidden, settings shows "connect Stripe", admin checkout link → 409. |

## Sign-off

Run the manual rows against a deployed preview with the Phase 6 migration applied and Stripe **test** keys, per `qa/launch-readiness-checklist.md`. Rows 7/14/15 (concurrency, duplicate/out-of-order webhooks) require a real Postgres + Stripe test event delivery; there is no test DB or Stripe fixture harness in CI yet (tracked gap, same as Phases 2–5). **No live card is charged at any point.**
