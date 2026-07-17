# ADR-0016 — Job Costing: Frozen Rate Snapshots, Derived Rollups, and Cost-Blind Technicians

**Status:** Accepted (Phase 9, 2026-07-17)

## Context

Phase 5 shipped `work_orders.actual_cost_cents` with the comment *"Rolls up actual time/material cost; job-costing wiring is a later phase"* — it has sat at `0` ever since, with nothing writing it. Phase 9 wires it. Until now the app could tell an owner what a job **billed** (Phase 6 invoices) but never what it **cost**, so it could not answer the only question that decides whether a service business survives: *did we make money on that job?*

The inputs are labor time, mileage, expenses, and materials. Each raises a decision about accuracy, history, and who is allowed to see it.

## Decisions

### 1. Rates are frozen onto every entry, never joined at read time

A time entry stores the `hourly_cost_cents` used **at the moment it was logged**; a mileage entry stores its `rate_cents_per_mile`. We never compute cost by joining to the technician's *current* rate.

This is the same discipline as Phase 2's pricebook line-item snapshots and Phase 6's frozen invoice lines, and for the same reason: a raise, a mileage-rate change, or a corrected typo must not silently rewrite the cost of every job in history. Last quarter's margin is a fact; it must not move because payroll changed today. The snapshot is what makes historical costing trustworthy and auditable.

### 2. `actual_cost_cents` is DERIVED from entries, never incremented

After any costing entry is created, updated, or deleted, the work order's `actual_cost_cents` is **recomputed from the full set of entries** and written as an absolute value — never `actual_cost_cents += x`.

Identical reasoning to the Phase 6 payment ledger (ADR-0012): an increment is a lost update waiting to happen under concurrency, retries, or a partial failure, and it can drift from reality with no way to detect it. A recompute is self-healing — if it ever drifts, the next write corrects it, and the entries remain the single source of truth. The rollup is a **cache of a pure function over the entries**, and that pure function (`rollupJobCost`) is unit-tested independently of the database.

### 3. Technicians log costs but are structurally blind to them

A technician must be able to record 90 minutes on a job, 12 miles, and a $40 part. A technician must **never** see their own burdened labor rate, the job's cost, or its margin — that is compensation-adjacent and owner-only information, and leaking it through a field app is a real-world HR incident.

So cost visibility is a **server-side redaction**, not a UI choice:
- Writing an entry requires `canLogJobCosts` (technicians: **yes**).
- Reading money on an entry — `hourly_cost_cents`, `rate_cents_per_mile`, `cost_cents` — and the job-costing summary requires `canViewJobCosting` (technicians: **no**).
- Tech-facing responses go through an allowlist serializer that structurally omits the money fields, exactly like `PublicEstimate` omits `unit_cost`. The fields cannot leak because they are not in the shape.

Crucially, the **server computes the cost from the server-held rate** — a technician's request never supplies a rate or a cost. The client sends minutes and miles; the server prices them. There is no path for the field app to propose what labor is worth.

### 4. Minutes are canonical; a timer is optional sugar

`time_entries.minutes` is the authoritative quantity. `started_at`/`ended_at` are optional and only recorded when a timer was actually used; when present, minutes is derived from them server-side.

A pool tech does 15–25 short stops a day and will forget to stop a timer; forcing clock-in/clock-out as the only input would produce *worse* data than asking for minutes. Supporting both keeps the model honest without pretending to a precision the workflow doesn't have. (`visits.time_entry_minutes` predates this and stays as the completion-requirement field; `time_entries` is the costing record and may hold several entries per visit — e.g. two techs.)

### 5. Expenses carry billable intent, but Phase 9 does not auto-bill

An expense records `billable` and an optional `markup_percent`, which yields a computed `billable_amount_cents`. Phase 9 **surfaces** that number; it does not automatically push it onto an invoice.

Auto-billing would silently move money into a customer-facing document — the kind of external side-effect this project gates behind explicit approval. The owner decides. Wiring "add billable expenses to invoice" is a deliberate follow-up, not a default.

### 6. Materials come from the existing pricebook cost rail, not a new one

Material cost reuses `unit_cost` snapshots already frozen onto document lines (Phase 2). Phase 9 does not invent a second materials-costing system; it reads the rail that exists.

## Consequences

- **Historical costs are immutable in practice**: rate changes are forward-only. Correcting a genuinely wrong past rate means editing that entry (audited), not a global re-price.
- **The rollup is cheap to trust**: `actual_cost_cents` can be rebuilt from entries at any time; a reconciliation/backfill is a pure recompute.
- **Cost data has one visibility rail** (`canViewJobCosting`) enforced server-side, so a future UI can't accidentally expose it.
- **Margin is derived, never stored**: `approved_contract_amount_cents − actual_cost_cents`. Storing margin would be a third thing to keep in sync with two things that already move.
- **Technicians gain write surface** (their first cost-relevant writes), so the entries are tenant- and ownership-scoped: a tech may only log against a visit/work order assigned to them.

## Alternatives considered

- **Join to current rates at read time** — rejected (Decision 1): makes history mutable and margin non-reproducible.
- **Increment `actual_cost_cents` on each entry** — rejected (Decision 2): lost updates, undetectable drift; same trap ADR-0012 avoided.
- **One `canViewItemCosts` flag for pricebook *and* job costing** — rejected: pricebook cost is "what a part costs us"; job costing exposes **labor rates and margin**. Office staff may legitimately need pricebook costs while labor cost stays owner-only. Separate flags keep that possible.
- **Timer-only time capture** — rejected (Decision 4): worse data for this workflow.
- **Auto-add billable expenses to the invoice** — deferred (Decision 5): unapproved customer-facing money movement.
