# Spec — Work-Order Projects & Lifecycle Expansion (Phase 5)

Extends the single-visit work order into a project: parent/child multi-day/multi-visit jobs, internal tasks, attachments (with auto-attachment rules), tenant-configured checklist templates, tenant-configured completion requirements gating visit completion, an 11-state authoritative work-order lifecycle including archive-instead-of-delete, and safe close/reopen. Design: ADR-0010. Schema additions folded into `database-blueprint/work_order.schema.md`'s successor migration (see `supabase/migrations/20260713000001_phase5_work_order_projects_change_orders.sql`).

## Lifecycle

`new → assigned → scheduled → in_progress → on_hold → completed → closed → archived`, plus `estimate_needed`, `needs_follow_up`, `cancelled`. One state machine (`src/lib/work-orders/state-machine.ts`), fully unit-tested (15 tests). `archived` is terminal; `closed`/`cancelled` are the only statuses `archived` is reachable from.

Two lifecycle concepts are deliberately kept separate:
- **Status** — the state-machine-gated lifecycle field (`work_orders.status`).
- **Archived** — an orthogonal soft-delete marker (`archived_at`/`archived_by`), settable from *any* status via the dedicated archive/restore actions. A record can be hidden from active lists without having formally reached the terminal `archived` status, and vice versa. Business records are **never hard-deleted**.

`closeWorkOrder`/`reopenWorkOrder` are separate, version-gated actions (not exposed via the generic status PATCH): closing additionally checks for pending change orders that block closeout (`findBlockingChangeOrderIds`) and fails with 409 + the blocking IDs if any exist.

## What it does

- **Parent/child projects**: any work order may have a `parent_work_order_id`; creating a child (`POST /api/work-orders/[id]/children`) auto-sets the parent's `is_multi_day = true`. Children inherit the parent's service category and priority. Multi-technician support already existed (Phase 4's `visits.technician_id` + `visit_assignments`) — a multi-day project simply has multiple child work orders, each with its own visit(s)/technician(s).
- **Internal tasks**: lightweight checklist-style tasks (`work_order_tasks`) distinct from the customer-visible checklist — title, optional due date, optional assigned technician, sort order. A technician may toggle `is_completed` only on their own assigned task (route-level ownership + field-allowlist check); broader task management requires `canManageWorkOrderTasks`.
- **Attachments**: tenant-scoped file storage (`work_order_attachments`) with magic-byte validation (JPEG/PNG/WebP/PDF via `file-type`, no re-encoding for PDFs — a documented scope limit vs. the image pipeline, which strips EXIF), a customer-visible flag, and `work_order_attachment_rules` for auto-attaching standard documents (e.g. a warranty PDF) by service category at work-order-creation time (best-effort, non-fatal).
- **Checklist templates**: tenant-versioned, per-service-category templates (`checklist_templates` + `checklist_template_items`) with required/conditional items, overlaying (never replacing) the static fallback in `src/config/checklist-templates.ts`. Editing bumps `version` (optimistic concurrency). The resolved template + version is captured into an **immutable** `visit_checklist_snapshots` row the moment a visit is marked complete — later template edits can never retroactively change what a completed visit's checklist looked like.
- **Tenant-configured completion requirements**: `completion_requirement_rules` (per-category or tenant-wide default) can require any combination of: checklist fully complete, ≥1 photo, technician note, customer signature (typed), equipment reading, time entry, material usage, completion reason. `evaluateCompletionRequirements` (pure, unit-tested) is called **before** any write when a visit's PATCH would transition it to `completed`; failing requirements return 422 with a human-readable list, and the write never happens.
- **Archive / close / reopen**: `DELETE /api/work-orders/[id]` archives (soft) instead of hard-deleting; `POST .../restore` undoes it; `POST .../close` (from `completed` only, version-gated, blocked by pending change orders); `POST .../reopen` (from `closed` only, records `reopened_at`/`reopen_count`).

## API

| Route | Methods | Permission |
|---|---|---|
| `/api/work-orders/[id]/children` | GET, POST | view / `canCreateWorkOrders` |
| `/api/work-orders/[id]/close` | POST (version) | `canCloseWorkOrders` |
| `/api/work-orders/[id]/reopen` | POST (version) | `canCloseWorkOrders` |
| `/api/work-orders/[id]/restore` | POST | `canCreateWorkOrders` |
| `/api/work-orders/[id]` DELETE | — | `canCreateWorkOrders` (archives, not deletes) |
| `/api/work-orders/[id]/tasks` | GET, POST | any authed (own tasks) / `canManageWorkOrderTasks` |
| `/api/work-orders/[id]/tasks/[taskId]` | PATCH, DELETE | own-completion-only (tech) or `canManageWorkOrderTasks`; delete requires the permission |
| `/api/work-orders/[id]/attachments` | GET, POST | `canViewAllWorkOrders` / `canManageWorkOrderAttachments` (rate-limited upload) |
| `/api/work-orders/[id]/attachments/[attachmentId]` | PATCH, DELETE | `canManageWorkOrderAttachments` |
| `/api/checklist-templates` | GET, POST | `canManageChecklistTemplates` (view rides the same flag) |
| `/api/checklist-templates/[id]` | GET, PATCH, DELETE (archive) | `canManageChecklistTemplates` |
| `/api/settings/completion-requirements` | GET, PUT | `canManageCompletionRequirements` |

## Response conventions

`{ data }` (201 on create). Validation 422 + `fieldErrors`. Stale version on close/reopen/template patch → 409 + `currentVersion`. Invalid transition → 409. Pending change orders blocking closeout → 409 + `changeOrderIds`. Not found / cross-tenant → 404.

## Deliberately out of scope (Phase 5)

- **Job-costing wiring for `actual_cost_cents`** — the column exists and rolls up nothing automatically yet; a later phase owns time/material cost aggregation.
- **Attachment auto-rule admin UI** — the query layer (`applyAttachmentRules`) and table exist; there is no dedicated settings screen to author rules yet (rules must be seeded directly).
- **Checklist-template and completion-requirement settings UI** — both have complete, permissioned API routes; no dedicated admin screen ships this phase (tracked as a follow-up, not a gate blocker since the routes are fully functional and tested).

## Tests

State machine (15), completion-requirements evaluator (10) — plus the change-order test list in `specs/change-orders.md` and `qa/change-order-test-plan.md` for the parts of this spec that are easiest to verify alongside change orders (pending-CO closeout block, cross-tenant denial, archive-not-delete).
