# ADR-0009 — Schedule Source of Truth and Timezone Model

**Status:** Accepted (Phase 4, 2026-07-12)

## Context

Phase 4 adds an operational scheduling layer (dispatch, calendar, visit administration, recurring work). Two questions must be settled once: who owns scheduling relative to GHL, and how time is represented so that day/week views, recurring generation, and DST all behave correctly.

## Decisions

### 1. GHL owns original booking; ServiceOps owns operational scheduling

GHL remains the source of truth for the **original customer booking** (the appointment a lead booked). ServiceOps owns **field assignment, dispatch, visit execution, rescheduling, and operational schedule history**. We do **not** build a second lead-booking calendar (product-boundaries rule). `visits.ghl_appointment_id` + `ghl_sync_state` reference the GHL appointment; only *approved operational changes* sync back, via the existing durable outbox + idempotency pattern (Phase 1) — not built in Phase 4 beyond the reference columns and sync-state field, so no premature two-way sync.

### 2. UTC storage, tenant-local display, calendar dates as strings

Three representations, each with a clear role (`src/lib/scheduling/timezone.ts`):

- **Instants** (`planned_start_at`, `planned_end_at`, `blocked_time`, `actual_start_at`) — `TIMESTAMPTZ`, stored UTC. Derived from tenant-local wall-time input at write time.
- **Wall times** (`arrival_window_*`, availability `start_time`/`end_time`) — tenant-local `TIME` / `"HH:MM"` strings, interpreted in the tenant timezone.
- **Calendar dates** (`visits.scheduled_date`, recurrence occurrence dates, exceptions) — tenant-local `"YYYY-MM-DD"` strings, manipulated with pure UTC/string arithmetic, **never** `new Date(str)` in server-local time.

`tenants.timezone` (IANA, default `America/Los_Angeles`) is the single tenant clock. Conversion is DST-safe by iterative refinement using only the `Intl` API (no dependency): a spring-forward local day spans 23 real hours, a fall-back day 25, and a nonexistent wall time (spring-forward gap) converges to the closest valid instant rather than throwing. All of this is pinned by `timezone.test.ts` (17 tests).

### 3. Recurrence is pure and deterministic; generation is duplicate-proof

`expandRecurrence` (`src/lib/scheduling/recurrence.ts`) expands a blueprint (weekly/biweekly/monthly, day-of-week or day-of-month) over a window, honoring `paused_at` (→ zero occurrences) and skip exceptions, entirely on date strings — so the same inputs always yield the same dates (idempotent by construction). Generation is **double-guarded**: an app-layer existence check (fast path) plus a DB `UNIQUE(recurring_schedule_id, scheduled_date)` index; a concurrent or replayed cron that races past the check hits 23505 and counts it as a skip. Duplicates are impossible.

### 4. Optimistic concurrency on every mutating schedule write

`visits.version`, `blocked_time.version`, `recurring_schedules.version` gate assignment, reschedule, and pause. A stale write returns 409 + `currentVersion` (the drag-drop and dialog paths both surface "reload and retry"). This is the same rail as Phases 2–3.

### 5. Conflicts and capacity are non-blocking warnings

Double-booking a technician is **allowed** (crews sometimes stack jobs) but surfaced as a warning (`src/lib/scheduling/conflicts.ts`, client-side badges). Availability windows and capacity indicators inform the dispatcher; they never hard-block an assignment. This matches field reality and avoids fighting the operator.

### 6. Multi-technician: lead + assistants, backward compatible

`visits.technician_id` stays as the **lead** (every existing query, the tech mobile flow, and generation keep working unchanged). Additional technicians live in `visit_assignments`. This is additive — no migration of existing single-tech visits is required.

### 7. Cron observability + per-tenant isolation

`cron_runs` records every invocation (status, totals, per-tenant results, error). One tenant's failure is caught and recorded without aborting the whole run; because generation is idempotent, a failed run is safe to retry (it only fills gaps). The cron still fails closed without `CRON_SECRET` (Phase 1 H3).

## Alternatives considered

- **A dependency (luxon/date-fns-tz) for timezones** — rejected; the `Intl`-only approach is dependency-free, sufficient, and fully tested. Revisit only if requirements outgrow it.
- **Storing wall times as UTC instants everywhere** — rejected; arrival windows and availability are inherently local ("9–11 AM") and must not shift with DST.
- **Hard-blocking double-bookings** — rejected; contradicts field practice.
- **Replacing `visits.technician_id` with a pure join table** — rejected; needless churn and risk to the working tech flow.
- **Route optimization engine** — explicitly out of scope (no approved vendor); Phase 4 ships *manual* route ordering only, with no promise of mathematically optimal routing.

## Consequences

- All schedule time math goes through `src/lib/scheduling/timezone.ts`; new `new Date(dateStr)`-in-local-time code is a review-blocking smell.
- Phase 5+ (change orders, multi-visit projects) reuse `visit_assignments`, the schedule feed, and the conflict/capacity primitives.
- Two-way GHL appointment sync is deferred; the reference columns + sync-state are in place for when an approved change-sync is built.
