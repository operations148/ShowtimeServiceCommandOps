# Database Blueprint — Estimates (Phase 3)

Implemented in `supabase/migrations/20260711000003_phase3_estimates.sql`. Money columns are INTEGER cents (ADR-0005); rates/quantities are the only NUMERICs. The pre-existing `estimate_handoffs` table (technician flag) is **untouched** — this is a separate document layer that optionally links back to a handoff.

## Enums

- `estimate_status` = draft, ready, sent, viewed, accepted, declined, expired, converted, voided
- `estimate_line_item_kind` = standard, optional, recommended

## estimates

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK → tenants, CASCADE | |
| estimate_handoff_id | UUID FK → estimate_handoffs, SET NULL | optional link to the technician flag |
| work_order_id / property_id | UUID FK, SET NULL | optional |
| ghl_contact_id / ghl_opportunity_id | TEXT | reference only (GHL owns the record) |
| estimate_number | TEXT | EST-XXXX, tenant sequence; `UNIQUE (tenant_id, estimate_number)` |
| title | TEXT | |
| status | `estimate_status` | default draft |
| customer_name/email/phone/address | TEXT | denormalised operational snapshot |
| issue_date | DATE | |
| expires_at | TIMESTAMPTZ | |
| assigned_estimator_id | UUID FK → users | |
| proposal_template | TEXT | default 'standard' |
| subtotal, tax_amount, discount_amount, total | INTEGER cents | server-computed |
| tax_rate | NUMERIC(7,6) | decimal 0–1 |
| internal_notes | TEXT | **staff-only — never public** |
| customer_notes, terms | TEXT | shown on the proposal |
| version | INTEGER | optimistic concurrency + contract reference |
| sent_version, accepted_version | INTEGER | frozen snapshot pointers |
| public_token_hash | TEXT | SHA-256; `UNIQUE WHERE NOT NULL`; plaintext never stored |
| token_expires_at, token_revoked_at | TIMESTAMPTZ | |
| sent_at, viewed_at, accepted_at, declined_at, converted_at, voided_at | TIMESTAMPTZ | lifecycle |
| decline_reason | TEXT | |
| accepted_by_name, accepted_signature | TEXT | approval capture |
| accepted_ip, accepted_user_agent | TEXT | approval metadata |
| terms_acknowledged | BOOLEAN | |
| locked_at, locked_by | TIMESTAMPTZ / UUID | set on acceptance |
| converted_invoice_id | UUID FK → invoices, SET NULL | conversion link |
| created_by / created_at / updated_at | | `set_updated_at()` trigger |

Indexes: `(tenant_id, estimate_number)` unique, `public_token_hash` unique partial, `(tenant_id, status)`, work_order, handoff.

## estimate_line_items

Immutable snapshots (mirrors `invoice_line_items`). Key columns: `kind` (standard/optional/recommended), `option_group` (mutually-exclusive packages), `is_selected` (standard always true), plus the snapshot fields `name/description/unit/quantity/unit_price(cents)/unit_cost(cents, internal)/taxable/tax_category/discount_amount(cents)/markup_percent/total(cents)` and `source_pricebook_item_id`/`source_pricebook_version`. Indexed `(estimate_id, sort_order)` and `(tenant_id)`.

## estimate_versions

Append-only full snapshots. `version_type ∈ {draft, sent, accepted}`, `snapshot JSONB` (estimate + lines), `reason` (populated on override), `UNIQUE (estimate_id, version)`. This is the immutability record: the accepted-version row is never mutated.

## estimate_events

Append-only activity / approval / send log. `event_type` (created, updated, version_created, sent, send_failed, viewed, accepted, declined, override, converted, voided, token_revoked), `actor_user_id` (NULL for customer actions), `actor_name`, `ip`, `user_agent`, send-log fields (`recipient_email`, `preview_mode`, `test_override`, `provider_message_id`, `error_detail`), `metadata JSONB`.

## invoices — idempotent conversion guard

`CREATE UNIQUE INDEX idx_invoices_estimate_id ON invoices (estimate_id) WHERE estimate_id IS NOT NULL`. A second/concurrent estimate→invoice conversion hits 23505 and adopts the existing invoice — no duplicate.

## RLS & grants

All four tables: SELECT on tenant match; writes additionally require role in (tenant_admin, office_staff, platform_owner). Same "designed but currently unreachable for app traffic" caveat as the rest of the schema (see erd.md) — application-layer enforcement (permissions + tenant_id on every query + public-serializer redaction) is the active control. Grants: service_role + authenticated.
