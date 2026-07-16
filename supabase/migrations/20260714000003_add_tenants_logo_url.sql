-- =============================================================================
-- Migration — tenants.logo_url
--
-- Backfills another migration-history gap (same class as users.avatar_url in
-- 20260714000002): this column is read/written by the company-settings routes
-- (src/app/api/settings/company/*) and selected by the estimate / change-order /
-- invoice send modules for email + PDF branding, but was only ever added by
-- hand on the original production database. Any environment provisioned purely
-- from supabase/migrations/ was missing it, which makes those SELECTs error at
-- runtime (company settings page, and every document send/branding lookup).
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
