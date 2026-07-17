# Spec — Time, Mileage, Expenses & Job Costing (Phase 9)

**Status:** Code-complete (branch `feat/serviceops-phase-9-job-costing`, not merged/deployed)
**Related:** ADR-0016 (costing model), `database-blueprint/job-costing.md`, `qa/job-costing-test-plan.md`

## 1. Purpose

Answer the question the app could never answer before: **did we make money on that job?**

Phase 6 told an owner what a job *billed*. Nothing told them what it *cost*. Phase 5 created `work_orders.actual_cost_cents` with the note *"job-costing wiring is a later phase"* and left it at `0`. Phase 9 wires it: technicians and office staff record labor, mileage, and expenses against a work order; the server prices them from server-held rates; the owner sees cost and margin.

## 2. Who does what

| Actor | Can log time/mileage/expenses | Can see rates, cost, margin |
|---|---|---|
| Platform owner / Tenant admin | ✅ | ✅ (+ may edit anyone's entry, set rates) |
| Office staff | ✅ (data entry, receipts) | ❌ |
| **Technician** | ✅ (own work only) | ❌ **never** |
| Read-only owner | ❌ | ✅ |

The technician split is the point (ADR-0016 §3): a tech records 90 minutes and 12 miles but must never see their burdened rate or the job's margin. It's enforced by a **server-side allowlist serializer**, not by hiding UI.

## 3. What gets recorded

- **Time** (`time_entries`) — minutes (canonical) per technician per work order, optionally with a timer range. Multiple entries per visit are expected (two techs on one job).
- **Mileage** (`mileage_entries`) — miles driven, priced at the tenant's rate.
- **Expenses** (`job_expenses`) — material/part/subcontractor/equipment/permit/other, with vendor, date, optional receipt, and a `billable` + markup intent.

## 4. How costs are priced (the client never sets a price)

The request body carries **quantities only** — minutes, miles, an expense amount from a receipt. It never carries a rate or a computed cost. The server:

1. Resolves the rate: the technician's `hourly_cost_cents`, falling back to `tenants.default_labor_cost_cents` so an unconfigured tech doesn't silently cost $0/hr; mileage uses `tenants.default_mileage_rate_cents`.
2. **Freezes that rate onto the entry** (ADR-0016 §1) — a later raise never rewrites historical margin.
3. Computes `cost_cents` via the money module (integer cents, rounded once).
4. **Recomputes** `work_orders.actual_cost_cents` from the full entry set and writes it absolutely — never `+=` (ADR-0016 §2).

An expense amount *is* client-supplied (it's a receipt total the server can't derive) — but a **cost-blind caller's expense is forced to `amount_cents: 0, billable: false`**: a technician may record that a part was used without authoring its price.

## 5. Margin

Derived at read time, never stored:
- `margin_cents = grossProfit(contract, actual_cost)`
- `margin_percent = grossMargin(contract, actual_cost)` → **null when there is no contract value**, and the UI renders that as "—", not 0%. A 0% margin means "sold at exactly cost"; null means "we don't know yet". Conflating them would tell an owner a job broke even when it simply hasn't been priced.

## 6. Surfaces

- **Technician** (`/tech/job/[id]`): `LogTimeMileageCard` — one-handed Time/Miles logging, running totals, **no money anywhere**.
- **Owner** (`/dashboard/work-orders/[id]`): `JobCostingPanel` — contract / actual cost / margin / margin %, a labor-mileage-expense breakdown, the entry list, and an add-expense modal. Self-hides without `canViewJobCosting`.
- **Rates**: `PATCH /api/settings/costing-rates` (tenant mileage + labor fallback) and `PATCH /api/technicians/[id]/rate` (burdened hourly). Both `canManageJobCosting`, both audited.

## 7. API

| Route | Method | Permission |
|---|---|---|
| `/api/work-orders/[id]/costing` | GET | `canViewJobCosting` (no redacted variant — a summary without cost is noise) |
| `/api/work-orders/[id]/time-entries` | GET, POST | `canLogJobCosts` (rows redacted without `canViewJobCosting`) |
| `/api/work-orders/[id]/mileage-entries` | GET, POST | same |
| `/api/work-orders/[id]/expenses` | GET, POST | same (amount forced to 0 for cost-blind callers) |
| `/api/costing/{time-entries,mileage-entries,expenses}/[id]` | PATCH, DELETE | `canLogJobCosts` + own entry, or `canManageJobCosting` |
| `/api/settings/costing-rates` | GET, PATCH | `canManageJobCosting` |
| `/api/technicians/[id]/rate` | PATCH | `canManageJobCosting` |

A technician may only log against a work order assigned to them (lead assignee **or** a visit of theirs — multi-tech jobs). A technician's `technician_id` is forced to their own, so they can't attribute time to a colleague. Not-yours returns the same generic 404 as not-found (no existence oracle).

## 8. Explicitly out of scope

- **No auto-billing.** `billable` + markup are recorded and surfaced; nothing is pushed onto an invoice automatically (ADR-0016 §5) — that's unapproved customer-facing money movement. Wiring "add billable expenses to invoice" is a deliberate follow-up.
- **No timesheet approval workflow.** `canApproveTime` exists in `roles.ts` as a **dead scaffold flag** (declared, assigned per role, read by nothing). Phase 9 did not activate it — approval is a real workflow, not a checkbox, and belongs to its own phase. Flagged here so it stays visible rather than silently rotting.
- **No new materials-costing rail.** Material cost reuses the existing pricebook `unit_cost` snapshots (ADR-0016 §6).
- **No payroll.** `hourly_cost_cents` is a *burdened cost* input for margin math — not wages, not hours worked for pay.

## 9. Rollup rebuild

Because `actual_cost_cents` is only ever a cache of `rollupJobCost` over the entries, it can be rebuilt at any time by re-running `recomputeWorkOrderCost` — a drifted value self-heals on the next entry change. The pure function is unit-tested independently of the database.

## 10. Gates

`npx tsc --noEmit` clean · `npx next lint` no new errors · `npx vitest run` green · `npm run build` passing. Migration `20260717000001` is **not applied** until approved.
