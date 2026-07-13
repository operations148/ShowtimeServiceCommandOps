# Spec — Visits Admin (Phase 4)

The admin visit-management surface, replacing the placeholder `/dashboard/visits`. Complements the dispatch calendar (`specs/dispatch-and-scheduling.md`) with a filterable list + a rich per-visit detail view. Technician execution (checklist/photos/notes) still happens in the tech mobile flow; this is the office-side window into it.

## List (`/dashboard/visits`)

- Date-range picker (default: current month), status filter, free-text search (customer / address / job).
- Desktop table + mobile cards; rows link to the detail view.
- Built on the `/api/schedule` range feed (rich joined data: property, work order, assignments).

## Detail (`/dashboard/visits/[id]`)

- **Schedule summary**: scheduled time / arrival window, duration, lead tech, crew size, actual start, completion, last reschedule reason, estimate flag.
- **Checklist progress** (done / total), **photos**, **technician notes**, **completion message**.
- **Actions**: Assign (multi-tech modal) and Reschedule (keyboard-accessible dialog) — permissioned.
- **Schedule history**: the visit's `schedule_events` audit timeline (assign/reassign/reschedule/route-reorder).
- Link back to the parent work order.

Data via `GET /api/visits/[id]/detail` (rich `VisitWithSchedule`) + `GET /api/visits/[id]/activity` (audit). Technicians may open only their own visits; office/admin need `canViewSchedule`; actions need `canAssignTechnicians` / `canManageSchedule`.

## Preserved

Existing technician visit data (checklist snapshots, photos, notes, completion, estimate flag) is displayed unchanged — Phase 4 adds the admin lens, it does not alter the tech write path.

## Deferred

- Bulk actions, CSV export, saved filters.
- Follow-up / failed-incomplete reason capture UI (the visit status enum already carries `skipped`/`cancelled`; a structured reason field is a follow-up).
- Inline photo lightbox.
