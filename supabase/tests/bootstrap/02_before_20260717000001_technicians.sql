-- =============================================================================
-- TEST-ONLY PRE-HISTORY BASELINE — `technicians`
--
-- NOT A PRODUCTION MIGRATION. Never move this into supabase/migrations/.
-- Never apply to production. See ../README.md for full rationale.
--
-- Models the state of `technicians` immediately BEFORE
--   supabase/migrations/20260717000001_phase9_job_costing.sql
--
-- Unlike `invoices`, this table has NO `CREATE TABLE` anywhere in the tracked
-- migration history at all — not before, not after. It exists in production
-- (verified read-only) purely as out-of-band, dashboard-created DDL.
--
-- Note for readers coming from the application code: this table is NOT how the
-- app identifies technicians. Throughout this codebase a technician is a `users`
-- row with role='technician' (auth, RBAC, work_orders.assigned_technician_id and
-- every technician-scoped query all go through `users`). `technicians` is a
-- separate, parallel model referenced only by the job-costing and
-- technician-location migrations. That duplication is itself a real finding and
-- is tracked as a follow-up — this file only reproduces the table so the tracked
-- migration history can replay without skips.
--
-- DELIBERATELY OMITTED (later tracked migrations add these):
--   20260717000001 : hourly_cost_cents (INTEGER NOT NULL DEFAULT 0, with a
--                    CHECK >= 0) — the burdened internal labour rate.
--
-- Column set below = live production shape MINUS hourly_cost_cents, derived
-- from read-only PostgREST schema metadata. No rows, no PII.
-- =============================================================================

CREATE TABLE technicians (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name       TEXT        NOT NULL,
  initials   TEXT        NOT NULL,
  email      TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT true,

  -- Plain UUID, no FK in live production metadata — left unconstrained to
  -- match rather than inventing a relationship the real table does not have.
  user_id    UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
