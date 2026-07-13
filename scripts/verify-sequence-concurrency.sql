-- =============================================================================
-- verify-sequence-concurrency.sql — manual verification for
-- next_document_number() (migration 20260711000002).
--
-- Run against a NON-PRODUCTION database (local supabase or a staging branch)
-- AFTER applying the Phase 2 migration. Never run against production: it
-- claims (and therefore permanently skips) sequence numbers.
--
-- Usage: psql "$DATABASE_URL" -f scripts/verify-sequence-concurrency.sql
-- =============================================================================

-- Uses the seeded dev tenant. Substitute any existing tenant UUID.
\set tenant '''a0000000-0000-0000-0000-000000000001'''

-- ---------------------------------------------------------------------------
-- 1. Rapid-invocation uniqueness: 1,000 sequential claims in one session must
--    produce 1,000 distinct, gapless, monotonically increasing values.
--    (Uses 'change_order' so the test doesn't disturb the invoice sequence.)
-- ---------------------------------------------------------------------------
WITH claims AS (
  SELECT next_document_number(:tenant::uuid, 'change_order') AS n
  FROM generate_series(1, 1000)
)
SELECT
  COUNT(*)                        AS total_claims,
  COUNT(DISTINCT n)               AS distinct_values,
  MAX(n) - MIN(n) + 1             AS span,
  (COUNT(*) = COUNT(DISTINCT n))  AS no_duplicates,   -- must be t
  (MAX(n) - MIN(n) + 1 = COUNT(*)) AS gapless          -- must be t
FROM claims;

-- ---------------------------------------------------------------------------
-- 2. Tenant isolation: a second tenant's sequence is independent.
--    (Requires a second tenant row; skip if none exists.)
-- ---------------------------------------------------------------------------
-- SELECT next_document_number('<tenant-b-uuid>'::uuid, 'change_order');
-- Expected: 1 (starts fresh), regardless of tenant A's counter.

-- ---------------------------------------------------------------------------
-- 3. TRUE cross-session concurrency (manual, two terminals):
--
--    Terminal 1:                          Terminal 2:
--      BEGIN;
--      SELECT next_document_number(         -- (waits...)
--        :tenant::uuid, 'change_order');
--                                           SELECT next_document_number(
--                                             :tenant::uuid, 'change_order');
--      -- note the value                    -- statement BLOCKS on T1's row lock
--      COMMIT;                              -- unblocks, returns value + 1
--
--    Expected: Terminal 2's claim blocks until Terminal 1 commits, then
--    returns a value exactly one greater. This demonstrates the row-lock
--    serialization that makes duplicates impossible.
--
--    Rollback variant: if Terminal 1 issues ROLLBACK instead of COMMIT,
--    Terminal 2 receives Terminal 1's value (the claim rolled back) —
--    numbers are never lost inside explicit transactions.
-- ---------------------------------------------------------------------------
