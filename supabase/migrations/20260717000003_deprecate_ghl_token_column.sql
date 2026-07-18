-- =============================================================================
-- Migration — Deprecate the inert per-tenant GHL token column (Phase 10)
--
-- Additive/annotation only. NOT applied until approved.
--
-- `tenants.ghl_api_token_encrypted` has existed since the first migration
-- (20260506000002) commented "Encrypted GHL private integration token", but is
-- genuinely DEAD: never read, never written, and no encryption code exists.
-- Every GHL call uses one shared env token (GHL_PRIVATE_INTEGRATION_TOKEN).
--
-- The schema therefore advertises a per-tenant white-label capability the
-- product does not have. Per ADR-0017 we correct the record rather than build
-- the fiction (real per-tenant encrypted credentials is a phase, not a column,
-- and serves nobody with one live tenant).
--
-- We COMMENT rather than DROP: dropping is irreversible, the column is harmless
-- while unread, and a future real white-label implementation can adopt it. The
-- comment carries the warning to anyone inspecting the schema (\d tenants,
-- Supabase table editor) at zero risk.
-- =============================================================================

COMMENT ON COLUMN tenants.ghl_api_token_encrypted IS
  'DEPRECATED / INERT (ADR-0017, 2026-07-17). Never read or written. The product '
  'uses a single shared GHL token (env GHL_PRIVATE_INTEGRATION_TOKEN), not '
  'per-tenant credentials. Do NOT read/write this until a real multi-tenant '
  'encrypted-credential design lands (encryption at rest, key rotation, '
  'per-tenant client resolver). Kept, not dropped, so that work can adopt it.';

-- =============================================================================
-- ROLLBACK: COMMENT ON COLUMN ... IS NULL; (harmless either way).
-- =============================================================================
