# ADR-0010 — Work-Order Project Model: Archive vs. Status, Parent/Child Projects

**Status:** Accepted (Phase 5, 2026-07-13)

## Context

A work order needed to grow from a single-visit job into a project: multi-day/multi-visit jobs with several technicians, internal tasks, attachments, tenant-configurable checklists, and a gate on what "complete" requires. Two forces pulled in different directions: the lifecycle needed more states (scheduled, on_hold, closed, archived) for accurate reporting, and business records must never be physically deleted (existing rule, carried from every prior phase). This ADR fixes how those two ideas — a richer state machine and "soft delete" — coexist without being conflated.

## Decisions

### 1. Archive is a marker, not a status

`archived_at`/`archived_by` is a plain timestamp+actor pair, settable from **any** status via a dedicated action, orthogonal to the state-machine-gated `status` column. This mirrors the pattern already used for pricebook items and estimates (soft-delete via timestamp, never `DELETE FROM`). `status = ARCHIVED` is a *separate*, much narrower thing: a terminal lifecycle state reachable only from `CLOSED`/`CANCELLED` via the state machine. A record can be hidden from active lists (`archived_at` set) without having formally lifecycle-ended, and a record can formally reach `ARCHIVED` status without ever having been through the "hide me" action — these are answers to two different questions ("is this visible in my day-to-day lists?" vs. "has this job's lifecycle formally ended?") and conflating them would make either operation half-work for the other's use case.

### 2. Eleven states, one authoritative transition table

`WORK_ORDER_STATUS_TRANSITIONS` (`src/types/work-order.ts`) grew from 7 to 11 states. `CLOSED`/`ARCHIVED` are deliberately excluded from the generic status `<select>` dropdown in the admin UI (`WorkOrderDetail.tsx`) — they are reachable only through the dedicated `closeWorkOrder`/`archiveWorkOrder` actions, which additionally enforce optimistic concurrency (`version`) and, for close, the pending-change-order block. The generic PATCH-driven status change has neither guard; letting `CLOSED`/`ARCHIVED` through it would silently bypass both.

### 3. Reopen is a dedicated action, not a status PATCH

`reopenWorkOrder` (only from `CLOSED`) is version-gated and records `reopened_at`/`reopen_count` — provenance that a bare `PATCH { status: "needs_follow_up" }` would never capture. Same reasoning as #2: any transition that needs bookkeeping beyond "change this column" gets its own endpoint.

### 4. Parent/child, not a separate "project" entity

A multi-day/multi-visit project is modeled as an ordinary work order (`parent_work_order_id = NULL`) with children (`parent_work_order_id = <parent>`), rather than inventing a new top-level "Project" table. `is_multi_day` on the parent is a derived convenience flag (auto-set the moment a first child is created), not a second source of truth — the real signal is "does this WO have any children." Children inherit the parent's service category and priority at creation time (a quick-create path with no property picker, mirroring how a single job would already be scoped) but are otherwise ordinary work orders with their own visits, technicians, status, and checklist. Multi-technician support required no new plumbing — Phase 4's `visits.technician_id` (lead) + `visit_assignments` (additional techs) already covers a single visit with several technicians, and a project with several technicians on several days is just several such visits across the child work orders.

### 5. Checklist template versioning + immutable completion snapshot

Templates are tenant-editable (`checklist_templates`/`checklist_template_items`, versioned for optimistic concurrency), but a visit's completion writes an **immutable** `visit_checklist_snapshots` row capturing the resolved items + the template id/version in effect at that moment. Editing a template after the fact can never retroactively change what a completed visit's record shows — the same "snapshot at the moment of truth" pattern estimates/change orders use for financial documents, applied here to compliance/checklist evidence.

### 6. Completion requirements are evaluated before the write, not after

`evaluateCompletionRequirements` (pure function, `src/lib/work-orders/completion-requirements.ts`) is called by the visit PATCH route **before** calling `updateVisit` whenever the merged patch would transition status to `COMPLETED`. A failing check returns 422 with a human-readable list and the database is never touched — there is no "complete, then get flagged as incomplete" intermediate state to reconcile.

## Alternatives considered

- **A single `is_archived` boolean instead of a timestamp+actor pair** — rejected; every other soft-delete field in this codebase (pricebook, estimates) uses a timestamp, and `archived_by` is needed for the audit trail.
- **A dedicated `work_order_projects` table with its own id space** — rejected as unnecessary indirection; every operation a "project" needs (status, technician, checklist, visits) already exists on `work_orders`, and parent/child is a strictly simpler relation to reason about and query (`listChildWorkOrders`) than a join through a new entity.
- **Allowing `CLOSED`/`ARCHIVED` through the generic status PATCH with inline guards** — rejected; the guards (version check, pending-CO block) are non-trivial enough that duplicating them at the PATCH call site risks drift from the dedicated action's logic. One code path per guarded transition.

## Consequences

- Reporting/list views can filter "active" work simply by `archived_at IS NULL`, independent of whatever the granular status happens to be.
- The close/reopen/archive actions are the only places their respective guards live — no risk of a second, un-guarded path silently bypassing the pending-change-order block or losing concurrency safety.
- Multi-day projects add zero new tables and reuse every existing visit/technician/checklist mechanism; the only genuinely new relation is `parent_work_order_id`.
