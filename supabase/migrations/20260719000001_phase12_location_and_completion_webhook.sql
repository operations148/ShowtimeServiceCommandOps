-- =============================================================================
-- Migration — Phase 12: Technician location (last-known) + completion webhook
--
-- Additive only. NOT applied to any live database — application requires
-- explicit approval (same posture as every prior phase migration).
-- Rationale: ADR-0018.
--
-- Contents:
--   1. tenants.ghl_completion_webhook_url — GHL Inbound Webhook trigger URL
--      for the client's review-request workflow (null = payload step skipped)
--   2. properties.latitude/longitude/geocoded_at — Nominatim geocode cache
--   3. technician_locations — ONE row per technician (PK = technician_id, so
--      the table structurally cannot grow a movement history; last-known only)
--   4. RLS + grants
-- =============================================================================

-- 1. Tenant setting: where to POST the completion payload.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ghl_completion_webhook_url TEXT;

-- 2. Property geocode cache (re-geocoded only when the address changes; the
--    app clears geocoded_at on address edits).
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS latitude    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

-- 3. Last-known technician position. PRIMARY KEY on technician_id makes this
--    an upsert-in-place table: no history, no breadcrumb trail — a deliberate
--    privacy decision (ADR-0018 §2), not an omission.
CREATE TABLE IF NOT EXISTS technician_locations (
  technician_id UUID             PRIMARY KEY REFERENCES technicians(id) ON DELETE CASCADE,
  tenant_id     UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  latitude      DOUBLE PRECISION NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
  longitude     DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m    REAL             CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  recorded_at   TIMESTAMPTZ      NOT NULL,
  updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_technician_locations_tenant ON technician_locations (tenant_id);

CREATE TRIGGER technician_locations_updated_at
  BEFORE UPDATE ON technician_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. RLS (defense-in-depth; service-role app layer is the active control).
--    'technician' IS in the write list — techs post their own pings; the API
--    layer forces technician_id = the caller's own.
ALTER TABLE technician_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "technician_locations_select" ON technician_locations
  FOR SELECT USING (tenant_id = current_tenant_id());
CREATE POLICY "technician_locations_write" ON technician_locations
  FOR ALL USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner', 'technician')
  ) WITH CHECK (tenant_id = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON technician_locations TO service_role, authenticated;

-- =============================================================================
-- ROLLBACK / FORWARD-FIX NOTES
-- Additive. Drop technician_locations, then properties.latitude/longitude/
-- geocoded_at and tenants.ghl_completion_webhook_url. Outbox rows with
-- job_type 'completion_webhook' (added in app code, no schema change) simply
-- error-and-remain if the code is reverted — visible, not lost.
-- =============================================================================
