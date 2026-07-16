# Database Blueprint — Invoices, Payments Ledger, Reconciliation (Phase 6)

Implemented in `supabase/migrations/20260714000001_phase6_invoices_payments_ledger.sql` (additive). Money columns are INTEGER cents (ADR-0005). Also depends on two hand-added-column backfills applied this phase (`20260714000002_add_users_avatar_url.sql`, `20260714000003_add_tenants_logo_url.sql`) that fixed pre-existing migration-history gaps.

## invoice_status enum extension

Extended from 5 → 12 values via `ALTER TYPE ... ADD VALUE IF NOT EXISTS` (additive, safe since new values aren't used in DML in the same migration). Added: `ready`, `sent`, `viewed`, `partially_paid`, `overdue`, `refunded`, `credited`. Original values kept (`draft`, `deposit_due`, `deposit_paid`, `paid`, `void`). `deposit_paid` is now a LEGACY value — new code never sets it.

## invoices — Phase 6 hardening columns

| Column | Type | Notes |
|---|---|---|
| public_token_hash | TEXT | SHA-256 hash (ADR-0007); supersedes the legacy plaintext `public_token` (deprecated, retained) |
| token_expires_at / token_revoked_at | TIMESTAMPTZ | |
| version | INTEGER | optimistic concurrency |
| source_change_order_id | UUID FK → change_orders, SET NULL | |
| source_snapshot | JSONB | immutable snapshot of the source doc at creation |
| invoice_kind | TEXT | standard \| deposit \| milestone \| final (CHECK) |
| milestone_label | TEXT | |
| voided_at / voided_by / void_reason | TIMESTAMPTZ / UUID / TEXT | |
| refunded_at | TIMESTAMPTZ | |
| amount_refunded / credited_amount | INTEGER | cents, ledger-derived |
| credit_reason | TEXT | |

Also adds the estimates FK reserved since Phase 2 (`fk_invoices_estimate_id`), a partial unique index on `public_token_hash`, and a `(tenant_id, due_date)` index for aging. Unique index on `public_token_hash WHERE NOT NULL`.

## payments — the immutable ledger (ADR-0012)

Append-only money-movement facts; never mutated after insert except the reconciliation stamps.

| Column | Type | Notes |
|---|---|---|
| id, tenant_id, invoice_id | UUID | invoice_id is `ON DELETE RESTRICT` — payments pin the invoice |
| payment_number | TEXT | PAY-XXXX via `document_sequences('payment')` |
| kind | TEXT | payment \| refund \| credit (CHECK); direction lives here, `amount` is always positive |
| amount | INTEGER | cents, `> 0` |
| currency | TEXT | default usd |
| provider | TEXT | stripe \| manual |
| provider_account_id / _payment_intent_id / _checkout_session_id / _charge_id / _refund_id | TEXT | Stripe references only — no card data |
| status | TEXT | pending \| succeeded \| failed |
| failure_code / failure_message | TEXT | |
| refunded_payment_id | UUID FK → payments | a refund row points at the payment it reverses |
| idempotency_key | TEXT | |
| event_source | TEXT | webhook \| manual \| reconciliation |
| reconciliation_status | TEXT | unreconciled \| reconciled \| mismatch |
| reconciled_at | TIMESTAMPTZ | |
| metadata | JSONB | |
| created_by | UUID | NULL for webhook-originated |

**Idempotency guards** (partial unique indexes): one `payment` row per `provider_payment_intent_id`; one row per `provider_refund_id`; globally-unique `idempotency_key`. A replayed webhook hits 23505 and adopts the existing row.

## invoice_events

Append-only activity/audit log (mirrors `estimate_events`/`change_order_events`). `event_type` includes created/updated/sent/send_failed/viewed/payment_recorded/payment_failed/refund_recorded/credit_recorded/voided/token_revoked/overdue_marked/reconciliation_flagged/reconciliation_resolved. Send-log fields (recipient_email, preview_mode, test_override, provider_message_id, error_detail) + optional `payment_id` link.

## reconciliation_runs / reconciliation_findings

`reconciliation_runs` — platform-wide (no tenant_id; service_role only): triggered_by (cron/manual), status, invoices_checked, payments_checked, findings_count, error_detail, timestamps.

`reconciliation_findings` — per-tenant: finding_type (missing_ledger_entry / amount_mismatch / account_mismatch / status_mismatch / orphaned_payment), detail JSONB, status (open/resolved/ignored), resolved_by/resolved_at/resolution_reason.

## RLS & grants

`payments`, `invoice_events`, `reconciliation_findings`: SELECT on tenant match; writes require role in (tenant_admin, office_staff, platform_owner). `reconciliation_runs`: service_role only (platform-wide). Application-layer enforcement (permissions + mandatory tenant_id + public-serializer allowlist) is the active control, same caveat as the rest of the schema.
