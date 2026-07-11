# Database Blueprint — Pricebook & Document Sequences (Phase 2)

Implemented in `supabase/migrations/20260711000002_phase2_pricebook_and_sequences.sql`. Money columns are INTEGER cents (ADR-0005); rates/quantities are the only NUMERICs.

## document_sequences

Tenant-scoped, transaction-safe numbering (replaces `COUNT(*)+1`).

| Column | Type | Notes |
|---|---|---|
| tenant_id | UUID FK → tenants, CASCADE | PK part 1 |
| doc_type | TEXT CHECK in (invoice, estimate, change_order, payment) | PK part 2 |
| next_value | BIGINT ≥ 1, default 1 | the NEXT number to hand out |
| updated_at | TIMESTAMPTZ | |

Claimed via `next_document_number(p_tenant_id, p_doc_type)` — one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING next_value - 1`. Deny-all RLS (no policies); EXECUTE revoked from anon/authenticated, granted to service_role. Backfill seeds `invoice` above the max digits parsed from existing `invoice_number`s.

## pricebook_categories

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| tenant_id | UUID FK → tenants, CASCADE | |
| name | TEXT 1–120 | `UNIQUE (tenant_id, name)` |
| description | TEXT NULL | |
| sort_order | INTEGER default 0 | |
| is_active | BOOLEAN default true | |
| archived_at | TIMESTAMPTZ NULL | soft delete; restore clears |
| version | INTEGER default 1 | optimistic-concurrency token |
| created_by / updated_by | UUID FK → users, SET NULL | |
| created_at / updated_at | TIMESTAMPTZ | `set_updated_at()` trigger |

## pricebook_items

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK → tenants, CASCADE | |
| category_id | UUID FK → pricebook_categories, SET NULL | NULL = uncategorized |
| item_type | `pricebook_item_type` enum | service, labor, material, equipment, fee, discount, bundle |
| name | TEXT 1–200 | |
| description | TEXT NULL | |
| unit | TEXT NULL | each, hour, sq ft, gallon… |
| default_quantity | NUMERIC(12,3) ≥ 0, default 1 | |
| customer_price | INTEGER cents ≥ 0 | discounts store positive amounts (applied subtractively at document layer) |
| internal_cost | INTEGER cents ≥ 0 | **redacted server-side without `canViewItemCosts`** |
| taxable | BOOLEAN default true | |
| tax_category | TEXT NULL | |
| vendor_reference | TEXT NULL | |
| image_path | TEXT NULL | public `pricebook-images` bucket, secure pipeline |
| notes | TEXT NULL | internal |
| is_active | BOOLEAN default true | |
| sort_order | INTEGER default 0 | |
| archived_at | TIMESTAMPTZ NULL | soft delete |
| version | INTEGER default 1 | optimistic-concurrency token AND snapshot source version |
| created_by / updated_by / created_at / updated_at | | `set_updated_at()` trigger |

Indexes: `(tenant_id, is_active) WHERE archived_at IS NULL`, `(tenant_id, item_type)`, `(tenant_id, category_id)`, `(tenant_id, lower(name))`.

## pricebook_bundle_items

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK → tenants, CASCADE | |
| bundle_id | UUID FK → pricebook_items, CASCADE | the bundle |
| child_item_id | UUID FK → pricebook_items, RESTRICT | `UNIQUE (bundle_id, child_item_id)`, `CHECK (bundle_id <> child_item_id)`; API additionally rejects bundle-typed children (no nesting) |
| quantity | NUMERIC(12,3) > 0 | |
| sort_order | INTEGER | |

## invoice_line_items — snapshot columns added

`unit TEXT`, `unit_cost INTEGER` (cents, internal), `taxable BOOLEAN`, `tax_category TEXT`, `discount_amount INTEGER default 0`, `markup_percent NUMERIC(7,4)`, `source_pricebook_item_id UUID FK → pricebook_items SET NULL`, `source_pricebook_version INTEGER`. Lines are immutable snapshots (ADR-0006) — the source pointer detects drift, never re-prices.

## Baseline reconciliation (same migration)

`CREATE TABLE IF NOT EXISTS` definitions for `invoices` and `invoice_line_items` (previously created via the Supabase dashboard, untracked). No-ops on the live DB; codifies the shape `src/types/invoice.ts` expects. Fresh-environment provisioning still requires a live schema dump because migration 019 ALTERs the dashboard-created table (documented caveat, not fixable additively).

## RLS & grants

All three pricebook tables: SELECT on tenant match; INSERT/UPDATE/DELETE additionally require role in (tenant_admin, office_staff, platform_owner) — standard pattern, same "currently unreachable for app traffic" caveat as every table (see erd.md). Grants: service_role + authenticated.
