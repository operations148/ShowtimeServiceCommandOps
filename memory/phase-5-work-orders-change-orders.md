# Phase 5 Memory — Work-Order Projects, Multi-Visit, Change Orders

_Completed 2026-07-13 on branch `feat/serviceops-phase-5-work-orders`. Rationale in ADR-0010 (project model) + ADR-0011 (change-order approval); specs in `specs/work-order-projects.md` + `specs/change-orders.md`; schema in `database-blueprint/change-orders.md`; test plan in `qa/change-order-test-plan.md`._

## What was built

An 11-state work-order lifecycle (up from 7) with parent/child multi-day projects, internal tasks, attachments (+ auto-attach rules), tenant-versioned checklist templates with an immutable per-visit completion snapshot, tenant-configured completion requirements that gate visit completion *before* the write, archive-instead-of-delete, and a version-gated close/reopen. Alongside it, a full change-order document layer (draft→sent→viewed→accepted/rejected/expired/voided) that mirrors the Phase 3 estimate architecture wherever the domain allows, with a secure public customer-approval page, atomic contract-value application on acceptance, and an explicit (never automatic) schedule-impact application action. Migration `20260713000001` — additive, extends the `work_order_status` enum via `ADD VALUE IF NOT EXISTS`, **NOT applied to any live DB**.

## Primitives / patterns later phases MUST reuse

- **Archive ≠ status** (ADR-0010): `archived_at`/`archived_by` is a soft-delete marker settable from *any* status; `status = ARCHIVED` is a separate, state-machine-terminal value reachable only from `CLOSED`/`CANCELLED`. Don't conflate "hidden from lists" with "lifecycle formally ended" in later phases either.
- **Shared public-token + PDF-text utilities**: `src/lib/security/public-document-token.ts` and `src/lib/pdf/pdf-text.ts` are now domain-neutral (promoted out of `src/lib/estimates/` the moment change orders needed the identical logic). Any future public-token document (invoices?) should import these, not fork them.
- **Pending-change-order closeout block**: `findBlockingChangeOrderIds` lives in the work-orders query module specifically so any future invoicing/closeout gate can reuse the identical check rather than re-deriving it.
- **Contract-value application timing** (ADR-0011): apply financial side effects (unambiguous, single-scalar) atomically as part of the SAME accept request. Keep anything requiring human disambiguation (schedule impact — which visit absorbs it?) as a separate, always-explicit action. This split is the reusable lesson, not just a change-order specifics.
- **Immutable snapshot at the moment of truth**: `visit_checklist_snapshots` (this phase) extends the same pattern estimates/change orders use for financial documents — capture the resolved state + provenance (template id/version) the instant it becomes historically true, so later edits to the *template* can never retroactively rewrite *history*.
- **Pre-write gating**: `evaluateCompletionRequirements` runs before `updateVisit` is ever called when a PATCH would complete a visit. The established pattern for any future "can this transition happen" check is to validate and reject before touching the DB, not to write-then-detect-and-flag.

## Deliberately deferred (documented, not gate blockers)

- Checklist-template, completion-requirement, and attachment-rule admin settings screens — all three have complete, tested, permissioned API routes; no dedicated UI page ships this phase. Seed/edit via API directly until a settings screen is built.
- `/api/change-orders/[id]/transition` only accepts `to: "voided"` from staff — the state machine allows `rejected`/`expired → draft`, but that reopen path is currently only reachable via the reasoned, permissioned `/override` action, not a bare transition.
- Job-costing rollup into `work_orders.actual_cost_cents` — the column exists and is displayed, but nothing populates it automatically yet.
- Real drawn-signature capture — both the public estimate and public change-order pages use a typed full name as the "signature," matching the existing Phase 3 convention; `accepted_signature`/`signature` columns/fields exist for a future upgrade but no capture UI was built.

## Bugs found and fixed incidentally (same pattern as every prior phase's proactive audit)

- **4 hardcoded `"tenant-showtime"` fallback defaults** closed: `listWorkOrders`, `createWorkOrder`, `updateVisit`, `listVisits`. All were dead in practice (every existing caller already passed `tenant_id` explicitly) but were real tenant-isolation hazards per the standing "never default a tenant" rule. Each was verified via grep for all call sites before the default was removed.
- **1 real permission gap** closed: `PATCH /api/work-orders/[id]/tasks/[taskId]` previously let *any* authenticated non-technician role edit *any* task with zero permission check (only the technician-ownership branch had a guard). Now requires `canManageWorkOrderTasks` for non-technician callers.

## Verification gaps (flagged)

Cross-tenant, replay/idempotency, concurrent-accept, contract-value-application, pending-CO-closeout-block, and rate-limiting checks need a live DB / deployed preview — no test DB in CI yet (same gap as Phases 2–4). Admin UI (change-order editor/detail/WorkOrderDetail additions) and the public change-order page are typecheck + production-build verified, not browser-tested. Enumerated in `qa/change-order-test-plan.md`. Test count: 15 (WO state machine) + 12 (CO state machine) + 7 (CO totals) + 9 (public serializer redaction) + 10 (completion requirements) + shared 16 (public-token + pdf-text, moved) = 275 total passing across the whole suite.
