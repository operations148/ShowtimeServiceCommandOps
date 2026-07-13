# Database Blueprint — Scheduling (Phase 4)

Implemented in `supabase/migrations/20260712000001_phase4_scheduling.sql`. Instants are UTC `TIMESTAMPTZ`; wall times are tenant-local `TIME`; calendar dates are tenant-local `DATE`/strings (ADR-0009).

## tenants (added)

`timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles'` — the single tenant clock for all schedule computation.

## visits (added columns)

`planned_start_at`/`planned_end_at` (TIMESTAMPTZ, UTC), `arrival_window_start`/`arrival_window_end` (TIME, local), `estimated_duration_minutes` (1–1440), `travel_buffer_minutes` (0–480, default 0), `all_day` (bool), `route_order` (int, manual per tech/day; null=unordered), `reschedule_reason` (most recent; full history in schedule_events), `actual_start_at`, `version` (optimistic concurrency), `ghl_appointment_id` (reference only), `ghl_sync_state` (none|linked|pending|synced|failed). `technician_id` stays as the **lead**. Index: `(tenant_id, planned_start_at)`.

**Dropped:** `idx_visits_one_active_per_wo` — its own comment marked it optional; multi-day projects need parallel active visits per work order.

## visit_assignments

Multi-technician assignment. `id`, `tenant_id`, `visit_id` (CASCADE), `technician_id` (CASCADE), `role` (lead|assistant), `created_by`, `UNIQUE (visit_id, technician_id)`. The lead is also mirrored on `visits.technician_id` for backward compatibility.

## blocked_time

Technician time off / holds. `id`, `tenant_id`, `technician_id`, `starts_at`/`ends_at` (UTC, `CHECK ends_at > starts_at`), `all_day`, `reason`, `version`, `created_by`. Index `(tenant_id, technician_id, starts_at)`.

## technician_availability

Weekly working-hours template (tenant-local wall times). `id`, `tenant_id`, `technician_id`, `day_of_week` (0–6), `start_time`/`end_time` (`CHECK end > start`), `UNIQUE (technician_id, day_of_week, start_time)`. No rows = always available.

## recurring_schedules (added columns) + recurring_exceptions

Added: `duration_minutes`, `arrival_window_start`/`end`, `checklist_template`, `paused_at` (pause/resume without losing the blueprint), `version`, `notes`.

`recurring_exceptions`: `id`, `tenant_id`, `schedule_id` (CASCADE), `exception_date` (tenant-local occurrence to skip), `reason`, `created_by`, `UNIQUE (schedule_id, exception_date)`.

## schedule_events

Append-only assignment/schedule audit log. `event_type` (assigned, reassigned, rescheduled, route_reordered, blocked_time_created/deleted, schedule_paused/resumed, occurrence_skipped/generated), `visit_id`?, `schedule_id`?, `actor_user_id`, `reason`, `old_value`/`new_value` JSONB. Indexed by visit, schedule, tenant (created_at DESC).

## cron_runs

Cron observability (deny-all RLS; service_role only). `job_name`, `started_at`, `finished_at`, `status` (running|succeeded|failed), `totals` JSONB, `by_tenant` JSONB, `error`. Index `(job_name, started_at DESC)`.

## work_orders — duplicate-proof generation

`CREATE UNIQUE INDEX idx_wo_schedule_occurrence ON work_orders (recurring_schedule_id, scheduled_date) WHERE recurring_schedule_id IS NOT NULL`. The cron's app-layer existence check is the fast path; this index makes duplicates impossible under concurrent/replayed runs (insert → 23505 → skip).

## RLS & grants

visit_assignments, blocked_time, technician_availability, recurring_exceptions, schedule_events: SELECT on tenant match; writes require role in (tenant_admin, office_staff, platform_owner). cron_runs: deny-all (service_role only). Same "designed but currently unreachable for app traffic" caveat as the rest of the schema (see erd.md). Grants: service_role + authenticated (cron_runs: service_role only).
