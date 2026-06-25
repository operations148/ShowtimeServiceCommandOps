-- =============================================================================
-- Migration 020 — grant invoices table access to service_role
--
-- The invoices table was created via the Supabase dashboard before the standard
-- alter-default-privileges were applied. This migration adds the missing grants
-- so the service role client (src/lib/db/client.ts) can read and write invoices.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT ON public.invoices TO anon;
