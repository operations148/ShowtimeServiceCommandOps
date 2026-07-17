# Database Blueprint — Time, Mileage, Expenses, Job Costing (Phase 9)

Migration: `supabase/migrations/20260717000001_phase9_job_costing.sql` (additive; **not applied** until approved).

All money is integer cents (`src/lib/money/money.ts`). Every table carries `tenant_id` and is RLS-enabled (defense-in-depth; the service-role app layer is the active control). Types: `src/types/costing.ts`. Rationale: ADR-0016.

## Altered tables

### `technicians`
| Column | Type | Notes |
|---|---|---|
| `hourly_cost_cents` | `INTEGER NOT NULL DEFAULT 0` | **Burdened** internal labor cost per hour (not the customer rate, not take-home pay). Owner-only — never exposed to `technician` role. Changing it is **forward-only**: existing `time_entries` keep their frozen snapshot (ADR-0016 §1). |

### `tenants`
| Column | Type | Notes |
|---|---|---|
| `default_mileage_rate_cents` | `INTEGER NOT NULL DEFAULT 0` | Cents per mile, snapshotted onto each mileage entry at log time. |
| `default_labor_cost_cents` | `INTEGER NOT NULL DEFAULT 0` | Fallback hourly cost when a technician has no rate set (keeps costing from silently reading 0). |

### `work_orders` — no new columns
`actual_cost_cents` and `approved_contract_amount_cents` already exist (Phase 5). Phase 9 finally **writes** `actual_cost_cents` as a derived rollup. Margin is computed, never stored (ADR-0016 §2).

## New tables

### `time_entries` — labor
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `tenant_id` | `UUID` FK→tenants, cascade | |
| `work_order_id` | `UUID` FK→work_orders, cascade | Costing rolls up here |
| `visit_id` | `UUID` FK→visits, set null | Optional — which visit the time was on |
| `technician_id` | `UUID` FK→technicians, restrict | Who worked |
| `minutes` | `INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 1440)` | **Canonical** quantity (ADR-0016 §4) |
| `started_at` / `ended_at` | `TIMESTAMPTZ` null | Only when a timer was used; minutes derived server-side |
| `hourly_cost_cents` | `INTEGER NOT NULL CHECK (>= 0)` | **Frozen snapshot** of the rate at log time |
| `cost_cents` | `INTEGER NOT NULL CHECK (>= 0)` | Computed server-side = round(minutes/60 × hourly_cost_cents) |
| `notes` | `TEXT` null | |
| `created_by` | `UUID` FK→users, set null | |
| `created_at`/`updated_at` | `TIMESTAMPTZ` | `updated_at` trigger |

Indexes: `(tenant_id, work_order_id)`, `(tenant_id, technician_id, created_at DESC)`, `(visit_id)`.

### `mileage_entries` — travel
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `tenant_id` | `UUID` FK, cascade | |
| `work_order_id` | `UUID` FK→work_orders, cascade | |
| `visit_id` | `UUID` FK→visits, set null | |
| `technician_id` | `UUID` FK→technicians, restrict | |
| `miles` | `NUMERIC(8,2) NOT NULL CHECK (miles > 0 AND miles <= 2000)` | Distance is genuinely fractional — the only non-integer quantity here; the **cost it produces is still integer cents** |
| `rate_cents_per_mile` | `INTEGER NOT NULL CHECK (>= 0)` | **Frozen snapshot** |
| `cost_cents` | `INTEGER NOT NULL CHECK (>= 0)` | Computed = round(miles × rate) |
| `notes` | `TEXT` null | |
| `created_by` | `UUID` FK→users, set null | |
| `created_at`/`updated_at` | `TIMESTAMPTZ` | |

Indexes: `(tenant_id, work_order_id)`, `(tenant_id, technician_id, created_at DESC)`.

### `job_expenses` — materials/parts/subcontractor/other
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `tenant_id` | `UUID` FK, cascade | |
| `work_order_id` | `UUID` FK→work_orders, cascade | |
| `visit_id` | `UUID` FK→visits, set null | |
| `category` | `TEXT NOT NULL` | CHECK in (`material`, `part`, `subcontractor`, `equipment`, `permit`, `other`) |
| `description` | `TEXT NOT NULL` | |
| `vendor` | `TEXT` null | |
| `amount_cents` | `INTEGER NOT NULL CHECK (>= 0)` | What we paid (cost) |
| `billable` | `BOOLEAN NOT NULL DEFAULT false` | Intent only — Phase 9 never auto-bills (ADR-0016 §5) |
| `markup_percent` | `NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (>= 0)` | |
| `billable_amount_cents` | `INTEGER NOT NULL DEFAULT 0 CHECK (>= 0)` | Computed = amount + markup, when billable |
| `receipt_path` | `TEXT` null | Supabase Storage path (reuses the job-photo bucket rail + magic-byte validation) |
| `incurred_on` | `DATE NOT NULL` | |
| `created_by` | `UUID` FK→users, set null | |
| `created_at`/`updated_at` | `TIMESTAMPTZ` | |

Indexes: `(tenant_id, work_order_id)`, `(tenant_id, incurred_on DESC)`.

## The rollup

`actual_cost_cents` on a work order = `SUM(time_entries.cost_cents) + SUM(mileage_entries.cost_cents) + SUM(job_expenses.amount_cents)` for that work order, **recomputed and written absolutely** after any entry change (ADR-0016 §2). Never incremented. Implemented as a pure function (`rollupJobCost`, unit-tested) plus a thin persist step, so the number can always be rebuilt from the entries.

Margin (derived at read time, never stored) — reuses the existing money module rather than reimplementing:
```
margin_cents   = money.grossProfit(approved_contract_amount_cents, actual_cost_cents)
margin_percent = money.grossMargin(approved_contract_amount_cents, actual_cost_cents)
```
`grossMargin` returns **null** when there is no contract value — margin is *undefined*, not 0%. Callers must render null distinctly ("—" / "no contract value") from a real 0% margin, which means "sold at exactly cost".

## Visibility

Two distinct rails (ADR-0016 §3):
- `canLogJobCosts` — create/update own entries. **Technicians: yes.**
- `canViewJobCosting` — read `cost_cents` / rates / summary / margin. **Technicians: no.** Enforced by an allowlist serializer that structurally omits money fields, not by the UI.

## Relationships

```
work_orders 1─┬─* time_entries    *─1 technicians
              ├─* mileage_entries *─1 technicians
              └─* job_expenses
visits 1─┬─* time_entries (optional)
         ├─* mileage_entries (optional)
         └─* job_expenses (optional)
tenants 1─* (all three) ; tenants.default_mileage_rate_cents / default_labor_cost_cents feed snapshots
technicians.hourly_cost_cents feeds the time_entries snapshot
```

## RLS

All three tables `ENABLE ROW LEVEL SECURITY` via the same `DO $$ FOREACH` pattern as Phase 7: `SELECT` policy `USING (tenant_id = current_tenant_id())`, `ALL` write policy additionally requiring `current_user_role() IN ('tenant_admin','office_staff','platform_owner','technician')`, plus `GRANT ... TO service_role, authenticated`. Technicians are included in the write role list here (unlike portal tables) because logging costs is their job; the *cost visibility* restriction is enforced in the app layer's serializer, not RLS.

## Rollback

Additive only. Drop in reverse order while unused: `job_expenses`, `mileage_entries`, `time_entries`, then the added columns on `technicians`/`tenants`. `work_orders.actual_cost_cents` predates Phase 9 — leave it (it simply returns to never being written).
