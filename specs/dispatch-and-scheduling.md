# Spec — Dispatch & Scheduling (Phase 4)

The operational scheduling layer: a calendar/dispatch board, multi-technician assignment, reschedule, blocked time, technician availability, and durable recurring work generation. GHL owns the original customer booking; ServiceOps owns field assignment, dispatch, and schedule history (ADR-0009). Schema: `database-blueprint/scheduling.md`. Visits admin surface: `specs/visits.md`.

## What it does

- **Calendar / dispatch** (`/dashboard/schedule`): week + day views, tenant-local "today" resolved server-side, date navigation. Drag-and-drop reschedule (drop a visit on a day) **and** a fully keyboard-accessible Reschedule dialog (required non-drag alternative). Unassigned + Overdue side panels. Client-side double-booking conflict warnings (non-blocking). Per-day manual route order.
- **Multi-technician assignment**: one lead (mirrored to `visits.technician_id`) + any number of assistants (`visit_assignments`). Versioned (optimistic concurrency).
- **Reschedule**: versioned; derives UTC `planned_start/end` from tenant-local date + time + duration; records a reason; audited in `schedule_events`.
- **Blocked time**: create/list/delete technician holds (UTC instants).
- **Technician availability**: weekly wall-time template (replace-all).
- **Recurring work**: pause/resume, skip-occurrence exceptions, and a no-write **preview** of the dates the cron would generate. Cron generation is timezone-aware, honors pause + exceptions, and is duplicate-proof.
- **Timezone safety**: UTC storage, tenant-local display, DST-correct day ranges (23h/25h), cross-midnight, all-day (ADR-0009, `timezone.test.ts`).

## API

| Route | Methods | Permission |
|---|---|---|
| `/api/schedule?from&to&technician_id&scope` | GET | canViewSchedule (techs: own visits) |
| `/api/visits/[id]/assign` | POST (version, lead, assistants) | canAssignTechnicians |
| `/api/visits/[id]/reschedule` | POST (version, date, time?, duration?, reason?) | canManageSchedule |
| `/api/visits/[id]/activity` | GET | canViewSchedule (techs: own) |
| `/api/visits/[id]/detail` | GET | canViewSchedule (techs: own) |
| `/api/schedule/route-order` | POST (visit_ids[]) | canManageSchedule |
| `/api/schedule/blocked-time` | GET (from,to), POST | view / manage |
| `/api/schedule/blocked-time/[id]` | DELETE | canManageSchedule |
| `/api/technicians/[id]/availability` | GET (self ok), PUT | manage |
| `/api/recurring-schedules/[id]/pause` | POST (version, paused) | canManageSchedule |
| `/api/recurring-schedules/[id]/skip` | GET, POST (exception_date) | view / manage |
| `/api/recurring-schedules/[id]/preview?weeks` | GET | canViewSchedule |
| `/api/cron/generate-visits` | GET | CRON_SECRET (fails closed) |

Permissions (Phase 4): `canViewSchedule` (view calendar/visits admin), `canManageSchedule` (reschedule/blocked-time/recurring control), plus existing `canAssignTechnicians` (assignment). Technicians get neither schedule flag — they are scoped to their own visits (`isTechnicianScoped`). Matrix pinned by `src/config/roles.test.ts`.

## Conventions

`{ data }` responses. Stale version → **409 + currentVersion**. Cross-tenant/unknown → 404. Invalid technician/visit references in a body → 422. Conflicts are warnings, never errors.

## Route workflow (manual only)

Manual `route_order` per technician/day. **No geocoding/route-optimization vendor** is integrated (none approved) — no travel estimates and no claim of mathematically optimal routing. Native-navigation deep links can be added when an address is present (follow-up).

## Deliberately out of scope (Phase 4)

- Two-way GHL appointment sync beyond the `ghl_appointment_id` + `ghl_sync_state` reference columns (approved-change sync is a later, outbox-backed task).
- Route optimization engine / paid geocoding vendor.
- Month view + team-grid view (day/week + per-technician grouping ship; month is a follow-up).
- Capacity math wired to real availability minutes in the UI (the `conflicts.ts` primitive + availability API exist; the calendar surfaces double-booking warnings, not yet a minutes-based capacity meter).

## Environment

`CRON_SECRET` (existing) gates generation. `tenants.timezone` (IANA) drives all schedule math.

## Tests

timezone (17), recurrence (12), conflicts/capacity (11) automated. Manual/live-DB items (permissions, cross-tenant, DnD API, stale-version, multi-tech, DST end-to-end, recurrence duplicate prevention, cron missing-secret/replay, GHL idempotency, E2E) in `qa/scheduling-test-plan.md`.
