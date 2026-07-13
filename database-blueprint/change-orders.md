# Database Blueprint — Change Orders & Work-Order Project Expansion (Phase 5)

Implemented in `supabase/migrations/20260713000001_phase5_work_order_projects_change_orders.sql` (single additive migration, not applied to any live DB — application requires explicit approval). Money columns are INTEGER cents (ADR-0005). All 11 new tables get RLS + grants applied via one `DO $ ... FOREACH t IN ARRAY [...] LOOP EXECUTE format(...) $` block, matching the "designed but app-layer-enforced" posture of the rest of the schema (see `erd.md`).

## Enums

- `change_order_status` = draft, sent, viewed, accepted, rejected, expired, voided
- `work_order_status` extended: added `scheduled`, `on_hold`, `closed`, `archived` (via `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, safe since the new values aren't used in DML within the same migration) — now 11 values total.

## work_orders — new columns

| Column | Type | Notes |
|---|---|---|
| parent_work_order_id | UUID FK → work_orders, SET NULL | `CHECK (id != parent_work_order_id)` — a WO cannot parent itself |
| is_multi_day | BOOLEAN | default false; auto-set true when a child is created |
| budget_cents | INTEGER | nullable |
| approved_contract_amount_cents | INTEGER | default 0; bumped atomically on change-order acceptance |
| actual_cost_cents | INTEGER | default 0; no automatic rollup wiring yet |
| customer_notes / internal_notes | TEXT | |
| cancellation_reason | TEXT | |
| archived_at / archived_by | TIMESTAMPTZ / UUID | soft-delete marker, orthogonal to `status` |
| closed_at / closed_by | TIMESTAMPTZ / UUID | set by the dedicated close action |
| reopened_at | TIMESTAMPTZ | set by the dedicated reopen action |
| reopen_count | INTEGER | default 0, incremented on each reopen |
| checklist_template_id | UUID FK → checklist_templates, SET NULL | |
| version | INTEGER | optimistic concurrency for close/reopen |

## work_order_tasks

Internal, non-customer-visible checklist-style tasks. `title`, `is_completed`, `assigned_technician_id` (FK → users, SET NULL), `due_date`, `sort_order`, `created_by`. Indexed `(tenant_id, work_order_id)`.

## work_order_attachments / work_order_attachment_rules

`work_order_attachments`: `file_path`, `file_name`, `mime_type`, `file_size_bytes`, `is_customer_visible`, `source ∈ {manual, auto}`, `uploaded_by`. Files live in a private Supabase Storage bucket (`work-order-attachments`); only JPEG/PNG/WebP/PDF pass the magic-byte sniff (`file-type` package) — PDFs are not re-encoded (documented scope limit vs. the image pipeline, which strips EXIF).

`work_order_attachment_rules`: `service_category` (nullable = all categories), `file_path`/`file_name`/`mime_type` of the template file to auto-attach, `description`, `is_active`. Applied best-effort at work-order-creation time (`applyAttachmentRules`) — a failure here never blocks WO creation.

## checklist_templates / checklist_template_items

`checklist_templates`: `service_category`, `name`, `is_active`, `archived_at`, `version` (optimistic concurrency; also captured as provenance in snapshots), `created_by`/`updated_by`. `UNIQUE (tenant_id, service_category) WHERE archived_at IS NULL` — one active template per category per tenant.

`checklist_template_items`: `template_id` FK, `label`, `is_required`, `conditional_categories` (TEXT[], additional categories beyond the template's own this item applies to), `sort_order`.

Overlays — never replaces — the static fallback in `src/config/checklist-templates.ts` (`resolveChecklistForCategory`: active tenant template if one exists, else the static list with every item required).

## visits — new completion-capture columns

| Column | Type | Notes |
|---|---|---|
| customer_signature | TEXT | typed name, not a drawn signature |
| equipment_reading | TEXT | |
| time_entry_minutes | INTEGER | |
| material_usage | TEXT | |
| completion_reason | TEXT | |
| checklist_template_id / checklist_template_version | UUID / INTEGER | which template was in effect at completion |

## visit_checklist_snapshots

Append-only, **immutable**. `visit_id`, `template_id`, `template_version`, `items JSONB` (`{label, is_required, completed, notes}[]`). Written the moment a visit transitions to `completed` — captures exactly what was required and what was checked off, independent of later template edits.

## completion_requirement_rules

Tenant-configured gate evaluated **before** a visit PATCH is allowed to set `status = completed`. One row per `(tenant_id, service_category)` plus an optional tenant-wide default row (`service_category IS NULL`) — partial unique indexes enforce one of each. Boolean flags: `require_checklist_complete`, `require_photos`, `require_technician_note`, `require_customer_signature`, `require_equipment_reading`, `require_time_entry`, `require_material_usage`, `require_completion_reason`. Resolution order: exact category row → tenant default row → hardcoded baseline (checklist + photos required, everything else optional) when the tenant has configured nothing.

## change_orders

| Column | Type | Notes |
|---|---|---|
| id, tenant_id, work_order_id | UUID | |
| change_order_number | TEXT | CO-XXXX, tenant sequence (`document_sequences.doc_type = 'change_order'`, already anticipated by Phase 2's CHECK constraint) |
| status | `change_order_status` | default draft |
| reason | TEXT | required, min 5 chars |
| scope_description | TEXT | |
| customer_name / customer_email | TEXT | resolved server-side from the linked property, not trusted from the request body |
| cost_impact_cents | INTEGER | internal — stripped by `redactChangeOrderCosts` for roles without `canViewItemCosts` |
| price_impact_cents, tax_impact_cents, total_impact_cents | INTEGER | customer-facing |
| tax_rate | NUMERIC(7,6) | |
| schedule_impact_days, schedule_impact_note | INTEGER / TEXT | recorded, never auto-applied |
| schedule_impact_applied_at / by | TIMESTAMPTZ / UUID | set only by the explicit apply-schedule-impact action |
| blocks_closeout | BOOLEAN | default true |
| internal_notes, customer_notes | TEXT | |
| version, sent_version, accepted_version | INTEGER | same pattern as estimates |
| public_token_hash, token_expires_at, token_revoked_at | TEXT / TIMESTAMPTZ | SHA-256 hash-at-rest, plaintext never stored |
| sent_at, viewed_at, accepted_at, rejected_at, voided_at | TIMESTAMPTZ | lifecycle |
| reject_reason, accepted_by_name, accepted_signature | TEXT | decision capture |
| locked_at, locked_by | TIMESTAMPTZ / UUID | set on acceptance |
| created_by / created_at / updated_at | | |

## change_order_line_items

Same shape as estimate line items minus the option-group/selection fields (every line always counts): `name/description/unit/quantity/unit_price(cents)/unit_cost(cents, internal)/taxable/discount_amount(cents)/total(cents)`, `source_pricebook_item_id`/`source_pricebook_version`.

## change_order_versions / change_order_events

Same append-only pattern as `estimate_versions`/`estimate_events`. `version_type ∈ {draft, sent, accepted}`; `event_type` includes `contract_value_applied` and `schedule_impact_applied` in addition to the estimate-equivalent set.

## RLS & grants

All 11 new tables: SELECT on tenant match; writes additionally require role in (tenant_admin, office_staff, platform_owner) — technicians write only through the dedicated, ownership-checked task-completion route. Application-layer enforcement (permissions + mandatory `tenant_id` on every query + the public-serializer allowlist) remains the active control, same caveat as the rest of the schema.
