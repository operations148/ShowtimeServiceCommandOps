-- =============================================================================
-- Migration 024 — Phase 4: dispatch, calendar, visit administration, recurring
--
-- Additive only (one deliberate index DROP, see §2). Not applied to any live
-- database by Claude Code.
--
-- CONTENTS
--   1. tenants.timezone — every schedule computation is tenant-tz aware
--   2. visits: scheduling columns (planned times, arrival window, duration,
--      travel buffer, all-day, route order, reschedule reason, version,
--      GHL appointment reference + sync state) + drop the one-active-visit
--      index (multi-day projects need parallel visits per work order)
--   3. visit_assignments — multi-technician assignment (visits.technician_id
--      remains the LEAD for full backward compatibility)
--   4. blocked_time — technician time off / holds
--   5. technician_availability — weekly working-hours template
--   6. recurring_schedules upgrades + recurring_exceptions (skip/pause)
--   7. schedule_events — assignment/schedule audit log (append-only)
--   8. cron_runs — cron observability (run, per-tenant result, errors)
--   9. Durable generation idempotency: UNIQUE (recurring_schedule_id,
--      scheduled_date) on work_orders — duplicate-proof under replayed crons
--  10. RLS, grants, indexes, triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tenant timezone (IANA name). Showtime Pool Service is California.
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles';

-- ---------------------------------------------------------------------------
-- 2. visits — scheduling columns
-- ---------------------------------------------------------------------------
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS planned_start_at        TIMESTAMPTZ,  -- UTC; derived from tenant-local input
  ADD COLUMN IF NOT EXISTS planned_end_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrival_window_start    TIME,         -- tenant-local wall time
  ADD COLUMN IF NOT EXISTS arrival_window_end      TIME,
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes BETWEEN 1 AND 1440),
  ADD COLUMN IF NOT EXISTS travel_buffer_minutes   INTEGER NOT NULL DEFAULT 0 CHECK (travel_buffer_minutes BETWEEN 0 AND 480),
  ADD COLUMN IF NOT EXISTS all_day                 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS route_order             INTEGER,      -- manual per-tech/day ordering; NULL = unordered
  ADD COLUMN IF NOT EXISTS reschedule_reason       TEXT,         -- most recent; full history in schedule_events
  ADD COLUMN IF NOT EXISTS actual_start_at         TIMESTAMPTZ,  -- actual times (completed_at already exists)
  ADD COLUMN IF NOT EXISTS version                 INTEGER NOT NULL DEFAULT 1,  -- optimistic concurrency
  ADD COLUMN IF NOT EXISTS ghl_appointment_id      TEXT,         -- reference only — GHL owns the booking
  ADD COLUMN IF NOT EXISTS ghl_sync_state          TEXT NOT NULL DEFAULT 'none'
    CHECK (ghl_sync_state IN ('none', 'linked', 'pending', 'synced', 'failed'));

CREATE INDEX IF NOT EXISTS idx_visits_planned_start
  ON visits (tenant_id, planned_start_at) WHERE planned_start_at IS NOT NULL;

-- Multi-day projects require parallel active visits on one work order. The
-- original index was documented as optional ("remove if the business allows
-- parallel visits on one WO") — Phase 4 is that decision.
DROP INDEX IF EXISTS idx_visits_one_active_per_wo;

-- ---------------------------------------------------------------------------
-- 3. visit_assignments — multi-technician
-- ---------------------------------------------------------------------------
CREATE TABLE visit_assignments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visit_id      UUID        NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  technician_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL DEFAULT 'assistant' CHECK (role IN ('lead', 'assistant')),
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visit_id, technician_id)
);

CREATE INDEX idx_visit_assignments_visit ON visit_assignments (visit_id);
CREATE INDEX idx_visit_assignments_tech  ON visit_assignments (tenant_id, technician_id);

-- ---------------------------------------------------------------------------
-- 4. blocked_time — technician time off / holds
-- ---------------------------------------------------------------------------
CREATE TABLE blocked_time (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  technician_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  all_day       BOOLEAN     NOT NULL DEFAULT false,
  reason        TEXT,
  version       INTEGER     NOT NULL DEFAULT 1,
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_blocked_time_tech ON blocked_time (tenant_id, technician_id, starts_at);

CREATE TRIGGER blocked_time_updated_at
  BEFORE UPDATE ON blocked_time
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. technician_availability — weekly working-hours template (tenant-local
--    wall times). No rows for a technician = treated as always available.
-- ---------------------------------------------------------------------------
CREATE TABLE technician_availability (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  technician_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week   SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    TIME        NOT NULL,
  end_time      TIME        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (technician_id, day_of_week, start_time),
  CHECK (end_time > start_time)
);

CREATE INDEX idx_tech_availability ON technician_availability (tenant_id, technician_id);

-- ---------------------------------------------------------------------------
-- 6. recurring_schedules upgrades + exceptions
-- ---------------------------------------------------------------------------
ALTER TABLE recurring_schedules
  ADD COLUMN IF NOT EXISTS duration_minutes     INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440),
  ADD COLUMN IF NOT EXISTS arrival_window_start TIME,
  ADD COLUMN IF NOT EXISTS arrival_window_end   TIME,
  ADD COLUMN IF NOT EXISTS checklist_template   TEXT,          -- optional override; defaults by service_category
  ADD COLUMN IF NOT EXISTS paused_at            TIMESTAMPTZ,   -- pause/resume without losing the blueprint
  ADD COLUMN IF NOT EXISTS version              INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes                TEXT;

CREATE TABLE recurring_exceptions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  schedule_id    UUID        NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE,
  exception_date DATE        NOT NULL,       -- tenant-local occurrence date to skip
  reason         TEXT,
  created_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, exception_date)
);

CREATE INDEX idx_recurring_exceptions_schedule ON recurring_exceptions (schedule_id);

-- ---------------------------------------------------------------------------
-- 7. schedule_events — append-only assignment/schedule audit log
-- ---------------------------------------------------------------------------
CREATE TABLE schedule_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visit_id      UUID        REFERENCES visits(id) ON DELETE CASCADE,
  schedule_id   UUID        REFERENCES recurring_schedules(id) ON DELETE CASCADE,
  -- assigned, reassigned, rescheduled, route_reordered, blocked_time_created,
  -- blocked_time_deleted, schedule_paused, schedule_resumed, occurrence_skipped,
  -- occurrence_generated
  event_type    TEXT        NOT NULL,
  actor_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  reason        TEXT,
  old_value     JSONB,
  new_value     JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedule_events_visit    ON schedule_events (visit_id, created_at DESC);
CREATE INDEX idx_schedule_events_schedule ON schedule_events (schedule_id, created_at DESC);
CREATE INDEX idx_schedule_events_tenant   ON schedule_events (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. cron_runs — observability for every cron job (not just generate-visits)
-- ---------------------------------------------------------------------------
CREATE TABLE cron_runs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name    TEXT        NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status      TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  totals      JSONB,      -- job-level summary
  by_tenant   JSONB,      -- per-tenant result map
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cron_runs_job ON cron_runs (job_name, started_at DESC);

-- ---------------------------------------------------------------------------
-- 9. Durable generation idempotency. The app-layer check-then-insert stays as
--    the fast path; this unique index makes duplicates IMPOSSIBLE under
--    concurrent or replayed cron runs (insert hits 23505 → counted as skip).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_wo_schedule_occurrence
  ON work_orders (recurring_schedule_id, scheduled_date)
  WHERE recurring_schedule_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 10. RLS + grants (same defense-in-depth caveat as the rest of the schema)
-- ---------------------------------------------------------------------------
ALTER TABLE visit_assignments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_time            ENABLE ROW LEVEL SECURITY;
ALTER TABLE technician_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_exceptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_runs               ENABLE ROW LEVEL SECURITY;  -- deny-all: service_role only

CREATE POLICY "visit_assignments_select" ON visit_assignments FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "visit_assignments_write" ON visit_assignments FOR ALL
  USING (tenant_id = current_tenant_id() AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner'))
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "blocked_time_select" ON blocked_time FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "blocked_time_write" ON blocked_time FOR ALL
  USING (tenant_id = current_tenant_id() AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner'))
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "technician_availability_select" ON technician_availability FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "technician_availability_write" ON technician_availability FOR ALL
  USING (tenant_id = current_tenant_id() AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner'))
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "recurring_exceptions_select" ON recurring_exceptions FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "recurring_exceptions_write" ON recurring_exceptions FOR ALL
  USING (tenant_id = current_tenant_id() AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner'))
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "schedule_events_select" ON schedule_events FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "schedule_events_write" ON schedule_events FOR ALL
  USING (tenant_id = current_tenant_id() AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner'))
  WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON visit_assignments       TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON blocked_time            TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON technician_availability TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_exceptions    TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON schedule_events         TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cron_runs               TO service_role;

-- =============================================================================
-- ROLLBACK / FORWARD-FIX NOTES
--
-- Additive except DROP INDEX idx_visits_one_active_per_wo (deliberate — the
-- index's own comment marked it optional; re-creating it would break
-- multi-visit projects and must not be done once parallel visits exist).
-- New tables can be dropped in reverse order while unused. The
-- idx_wo_schedule_occurrence unique index must stay once the cron relies on
-- it for duplicate-proof generation.
-- =============================================================================
