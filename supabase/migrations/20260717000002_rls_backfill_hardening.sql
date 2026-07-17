-- =============================================================================
-- Migration — RLS backfill hardening (security fix, found 2026-07-17)
--
-- Supabase's database advisor flagged 5 tables with Row Level Security
-- DISABLED, fully exposed to the anon/authenticated PostgREST roles. This was
-- verified live before this migration: the PUBLIC anon key could read
-- rate_limits rows (including login-attempt keys carrying user emails) — and
-- could equally DELETE them, resetting login brute-force protection.
--
-- This is pre-existing debt, not new schema: Phase 1 deliberately deferred a
-- full RLS retrofit, and these tables (Phases 1-6 vintage) missed the loop the
-- newer migrations apply. The application itself is unaffected by this fix —
-- every app query goes through the service-role client, which has BYPASSRLS.
--
-- Two shapes, matching what each table is:
--   A. Tenant-scoped domain tables (have tenant_id) → the SAME policy pattern
--      every other domain table already uses (see 20260714000001):
--        invoice_line_items, recurring_schedules, work_order_status_history
--   B. Internal infrastructure tables (NO tenant_id, no legitimate non-service
--      reader) → RLS enabled with NO policies (default-deny for anon/
--      authenticated) + explicit REVOKE:
--        rate_limits, webhook_events
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. Tenant-scoped domain tables
-- ---------------------------------------------------------------------------
ALTER TABLE invoice_line_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_schedules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_status_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoice_line_items', 'recurring_schedules', 'work_order_status_history'
  ]
  LOOP
    EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (tenant_id = current_tenant_id())', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_write" ON %I FOR ALL USING (tenant_id = current_tenant_id() AND current_user_role() IN (''tenant_admin'', ''office_staff'', ''platform_owner'')) WITH CHECK (tenant_id = current_tenant_id())',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO service_role, authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- B. Internal infrastructure tables — deny-all for API roles
--
-- No tenant_id and no legitimate reader other than the server:
--   rate_limits    — the Phase 1 login/action rate limiter's state. Public
--                    readability leaked login-attempt keys (user emails);
--                    public DELETE would reset brute-force protection.
--   webhook_events — GHL webhook intake ledger (provider payload hashes,
--                    processing state).
--
-- RLS with no policies denies anon/authenticated even where legacy default
-- grants exist; the REVOKEs remove those grants outright as belt-and-braces.
-- service_role has BYPASSRLS, so the app's access is untouched.
-- ---------------------------------------------------------------------------
ALTER TABLE rate_limits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON rate_limits    FROM anon, authenticated;
REVOKE ALL ON webhook_events FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_events TO service_role;

-- =============================================================================
-- ROLLBACK / FORWARD-FIX NOTES
--
-- Forward-only. If a policy proves too strict for a future direct-access
-- feature, add a new policy in a new migration — do not disable RLS again.
-- =============================================================================
