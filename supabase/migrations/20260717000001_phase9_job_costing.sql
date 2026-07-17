-- =============================================================================
-- Migration — Phase 9: Time, mileage, expenses, job costing
--
-- Additive only. NOT applied to any live database — application requires
-- explicit approval (same posture as every prior phase migration).
--
-- Wires `work_orders.actual_cost_cents`, which Phase 5 created with the note
-- "job-costing wiring is a later phase" and which nothing has written since.
--
-- Core rules (ADR-0016):
--   * Rates are FROZEN onto each entry at log time — never joined at read time,
--     so a raise can't retroactively rewrite last quarter's margin.
--   * `actual_cost_cents` is DERIVED (recomputed absolutely from entries),
--     never incremented — same discipline as the Phase 6 payment ledger.
--   * Technicians LOG costs but never SEE rates/cost/margin (app-layer
--     allowlist serializer; see src/lib/costing/serialize.ts).
--
-- Contents:
--   1. technicians.hourly_cost_cents         — burdened internal labor rate
--   2. tenants rate defaults                 — mileage + labor fallback
--   3. time_entries                          — labor
--   4. mileage_entries                       — travel
--   5. job_expenses                          — materials/parts/subs/other
--   6. RLS + grants
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. technicians.hourly_cost_cents
--    BURDENED internal cost per hour (not the customer-facing rate, not
--    take-home pay). Owner-only. Changing it is forward-only: existing
--    time_entries keep their frozen snapshot.
-- ---------------------------------------------------------------------------
ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS hourly_cost_cents INTEGER NOT NULL DEFAULT 0
    CHECK (hourly_cost_cents >= 0);

-- ---------------------------------------------------------------------------
-- 2. tenants rate defaults
--    default_labor_cost_cents is a FALLBACK so a technician with no rate set
--    doesn't silently cost the business $0/hr.
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS default_mileage_rate_cents INTEGER NOT NULL DEFAULT 0
    CHECK (default_mileage_rate_cents >= 0),
  ADD COLUMN IF NOT EXISTS default_labor_cost_cents   INTEGER NOT NULL DEFAULT 0
    CHECK (default_labor_cost_cents >= 0);

-- ---------------------------------------------------------------------------
-- 3. time_entries — labor
--    `minutes` is canonical; started_at/ended_at are optional and only present
--    when a timer was actually used (ADR-0016 §4). Several entries per visit
--    are expected (e.g. two techs on one job).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_entries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id)      ON DELETE CASCADE,
  work_order_id     UUID        NOT NULL REFERENCES work_orders(id)  ON DELETE CASCADE,
  visit_id          UUID        REFERENCES visits(id)                ON DELETE SET NULL,
  technician_id     UUID        NOT NULL REFERENCES technicians(id)  ON DELETE RESTRICT,

  minutes           INTEGER     NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,

  -- Frozen snapshot of the rate used to price this entry.
  hourly_cost_cents INTEGER     NOT NULL CHECK (hourly_cost_cents >= 0),
  -- Server-computed: round(minutes / 60 * hourly_cost_cents). Never client-supplied.
  cost_cents        INTEGER     NOT NULL CHECK (cost_cents >= 0),

  notes             TEXT,
  created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT time_entries_timer_range CHECK (
    (started_at IS NULL AND ended_at IS NULL) OR
    (started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at > started_at)
  )
);

CREATE INDEX IF NOT EXISTS idx_time_entries_wo     ON time_entries (tenant_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_tech   ON time_entries (tenant_id, technician_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_visit  ON time_entries (visit_id);

CREATE TRIGGER time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. mileage_entries — travel
--    `miles` is the one genuinely fractional quantity in the model; the cost it
--    produces is still integer cents.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mileage_entries (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID          NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  work_order_id       UUID          NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  visit_id            UUID          REFERENCES visits(id)               ON DELETE SET NULL,
  technician_id       UUID          NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,

  miles               NUMERIC(8,2)  NOT NULL CHECK (miles > 0 AND miles <= 2000),
  -- Frozen snapshot of the tenant's mileage rate at log time.
  rate_cents_per_mile INTEGER       NOT NULL CHECK (rate_cents_per_mile >= 0),
  -- Server-computed: round(miles * rate_cents_per_mile). Never client-supplied.
  cost_cents          INTEGER       NOT NULL CHECK (cost_cents >= 0),

  notes               TEXT,
  created_by          UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mileage_entries_wo   ON mileage_entries (tenant_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_mileage_entries_tech ON mileage_entries (tenant_id, technician_id, created_at DESC);

CREATE TRIGGER mileage_entries_updated_at
  BEFORE UPDATE ON mileage_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. job_expenses — materials/parts/subcontractor/other
--    `billable` + markup record INTENT only. Phase 9 surfaces the billable
--    amount; it never auto-pushes it onto a customer invoice (ADR-0016 §5).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_expenses (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  work_order_id         UUID          NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  visit_id              UUID          REFERENCES visits(id)               ON DELETE SET NULL,

  category              TEXT          NOT NULL CHECK (category IN (
                          'material', 'part', 'subcontractor', 'equipment', 'permit', 'other'
                        )),
  description           TEXT          NOT NULL,
  vendor                TEXT,

  -- What we paid.
  amount_cents          INTEGER       NOT NULL CHECK (amount_cents >= 0),
  billable              BOOLEAN       NOT NULL DEFAULT false,
  markup_percent        NUMERIC(6,3)  NOT NULL DEFAULT 0 CHECK (markup_percent >= 0),
  -- Server-computed: amount + markup when billable, else 0.
  billable_amount_cents INTEGER       NOT NULL DEFAULT 0 CHECK (billable_amount_cents >= 0),

  -- Supabase Storage path (same bucket rail + magic-byte validation as job photos).
  receipt_path          TEXT,
  incurred_on           DATE          NOT NULL,

  created_by            UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_expenses_wo   ON job_expenses (tenant_id, work_order_id);
CREATE INDEX IF NOT EXISTS idx_job_expenses_date ON job_expenses (tenant_id, incurred_on DESC);

CREATE TRIGGER job_expenses_updated_at
  BEFORE UPDATE ON job_expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. RLS + grants (defense-in-depth; service-role bypasses, app-layer is the
--    active control — same caveat as the rest of the schema).
--
--    NOTE: 'technician' IS in the write role list here, unlike the portal
--    tables — logging time/mileage/expenses is a technician's job. The
--    restriction that matters (technicians must not SEE rates/cost/margin) is
--    enforced by the app-layer allowlist serializer, not by RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE time_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE mileage_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_expenses    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['time_entries', 'mileage_entries', 'job_expenses']
  LOOP
    EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (tenant_id = current_tenant_id())', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_write" ON %I FOR ALL USING (tenant_id = current_tenant_id() AND current_user_role() IN (''tenant_admin'', ''office_staff'', ''platform_owner'', ''technician'')) WITH CHECK (tenant_id = current_tenant_id())',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO service_role, authenticated', t);
  END LOOP;
END $$;

-- =============================================================================
-- ROLLBACK / FORWARD-FIX NOTES
--
-- Additive only. New tables can be dropped in reverse dependency order while
-- unused: job_expenses, mileage_entries, time_entries; then the added columns
-- technicians.hourly_cost_cents, tenants.default_mileage_rate_cents,
-- tenants.default_labor_cost_cents.
--
-- work_orders.actual_cost_cents predates this migration (Phase 5) — leave it;
-- it simply returns to never being written.
-- =============================================================================
