# Phase 4 Memory — Dispatch, Calendar, Visit Administration, Recurring Work

_Completed 2026-07-12 on branch `feat/serviceops-phase-4-dispatch`. Rationale in ADR-0009; specs in `specs/dispatch-and-scheduling.md` + `specs/visits.md`; schema in `database-blueprint/scheduling.md`; runbook `docs/operations/recurring-job-runbook.md`._

## What was built

An operational scheduling layer: dispatch calendar (`/dashboard/schedule`), multi-technician assignment, versioned reschedule, blocked time, technician availability, durable recurring generation, and a real Visits admin page (`/dashboard/visits`, replacing the placeholder). Migration `20260712000001` — additive except one deliberate index drop; **NOT applied to any live DB**.

## Primitives / patterns later phases MUST reuse

- **Timezone** (`src/lib/scheduling/timezone.ts`, ADR-0009): UTC storage, tenant-local display (`tenants.timezone`), calendar dates as `"YYYY-MM-DD"` strings with pure UTC/string arithmetic. DST-safe (23h/25h days, nonexistent-wall-time convergence). **Never** `new Date(dateStr)` in server-local time — that's a review-blocking smell.
- **Recurrence** (`recurrence.ts`): pure, deterministic weekly/biweekly/monthly expansion honoring pause + exceptions. Idempotent by construction.
- **Conflicts/capacity** (`conflicts.ts`): overlap/availability/capacity are **non-blocking warnings** — double-booking is allowed (field reality).
- **Multi-tech**: `visits.technician_id` stays the LEAD (backward compatible); assistants in `visit_assignments`. Reuse for change orders / multi-visit projects (Phase 5).
- **Optimistic concurrency** (409 + currentVersion) on assign/reschedule/pause — same rail as Phases 2–3.
- **Cron durability**: idempotent generation is duplicate-proof via `UNIQUE(recurring_schedule_id, scheduled_date)` (23505 → skip); `cron_runs` records every run with per-tenant results; per-tenant failure isolation; still fails closed without `CRON_SECRET`.

## Deliberately deferred (documented)

- Two-way GHL appointment sync — only reference columns (`ghl_appointment_id`, `ghl_sync_state`) exist; approved-change sync via the outbox is a later task. GHL owns original booking.
- Route optimization / paid geocoding vendor — none approved; only MANUAL `route_order`, no optimal-routing claims.
- Month view + minutes-based capacity meter in the calendar (day/week + double-booking warnings ship; primitives for capacity exist).
- Structured failed/incomplete reason capture UI.

## Verification gaps (flagged)

Cross-tenant, stale-version, multi-tech, DnD-API, DST end-to-end, recurrence-duplicate, cron missing-secret/replay, and E2E checks need a live DB / deployed preview — no test DB in CI (same gap as Phases 2–3). Calendar/visits UIs are typecheck/build-verified, not browser-tested. Enumerated in `qa/scheduling-test-plan.md`. 212 total tests (added 40: timezone 17, recurrence 12, conflicts 11 + roles matrix rows).
