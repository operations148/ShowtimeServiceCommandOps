-- =============================================================================
-- Migration — restore the work_orders → users FK, add webhook outcome tracking
--
-- PROBLEM 1 (proven against production 2026-08-20)
--   Every query using WO_SELECT failed with PostgREST PGRST201:
--     "Could not embed because more than one relationship was found for
--      'work_orders' and 'users'"
--
--   The live database has work_orders_archived_by_fkey and
--   work_orders_closed_by_fkey (both added by 20260713000001, Phase 5) but is
--   MISSING the assigned_technician_id → users FK that 20260506000005 declared
--   inline. With two candidate relationships present and the intended one
--   absent, the bare `users(name)` embed in WO_SELECT became ambiguous and
--   threw on EVERY read and write that used `.select(WO_SELECT)`.
--
--   Blast radius that produced: GET /api/work-orders catches the error and
--   returns an empty list with HTTP 200, so the Work Orders dashboard silently
--   showed nothing; GHL webhook intake crashed inside its idempotency lookup
--   before it could ever insert a work order.
--
--   Restoring the FK lets the embed be disambiguated explicitly in code as
--   users!work_orders_assigned_technician_id_fkey(name).
--
-- PROBLEM 2
--   webhook_events could not distinguish "processed and did work" from
--   "returned normally without doing anything" — both were written as 'done'.
--   outcome_code records the precise reason so a skipped or rejected delivery
--   is no longer indistinguishable from a successful one.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Clear orphaned assigned_technician_id values
--
-- These reference users rows that do not exist. The column has always been
-- declared ON DELETE SET NULL, so NULL is the value these rows should already
-- have held — the invariant was simply never enforced, because the FK was
-- missing. They must be clean before the constraint below can be added.
-- ---------------------------------------------------------------------------
UPDATE public.work_orders wo
   SET assigned_technician_id = NULL
 WHERE wo.assigned_technician_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.users u WHERE u.id = wo.assigned_technician_id
   );

-- ---------------------------------------------------------------------------
-- 2. Restore the assigned_technician_id foreign key
--
-- DROP ... IF EXISTS first so this migration is idempotent, and so databases
-- where the constraint already exists converge on the same constraint name
-- that the application's embed hint depends on.
-- ---------------------------------------------------------------------------
ALTER TABLE public.work_orders
  DROP CONSTRAINT IF EXISTS work_orders_assigned_technician_id_fkey;

ALTER TABLE public.work_orders
  ADD CONSTRAINT work_orders_assigned_technician_id_fkey
  FOREIGN KEY (assigned_technician_id)
  REFERENCES public.users(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. webhook_events.outcome_code
--
-- processing_status stays coarse (done | ignored | failed_permanent |
-- failed_retryable); outcome_code carries the specific reason, e.g.
-- 'created', 'ignored_non_action_stage', 'rejected_validation'.
-- ---------------------------------------------------------------------------
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS outcome_code TEXT;

COMMENT ON COLUMN public.webhook_events.outcome_code IS
  'Precise processing outcome for the delivery (created, already_exists, ignored_non_action_stage, rejected_validation, unknown_tenant, failed_retryable, ...). processing_status alone cannot distinguish "did work" from "intentionally did nothing".';
