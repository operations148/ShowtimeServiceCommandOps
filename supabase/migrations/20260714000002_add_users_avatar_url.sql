-- =============================================================================
-- Migration — users.avatar_url
--
-- Backfills a gap in migration history: this column has been read/written by
-- src/app/api/profile/avatar/route.ts and selected by src/lib/auth/config.ts's
-- login query since early on, but was never added via a tracked migration —
-- it only ever existed because it was added by hand on the original
-- production database (Supabase dashboard), the same class of gap documented
-- for the pre-Phase-15 "dashboard-created" invoices table. Any environment
-- provisioned purely from supabase/migrations/ was missing it, which breaks
-- login outright (the auth query selects avatar_url and errors if absent).
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
