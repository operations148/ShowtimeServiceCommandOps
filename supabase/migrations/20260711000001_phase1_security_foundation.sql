-- =============================================================================
-- Migration — Phase 1: Security, Tenancy, Authorization, Audit, Reliability
--
-- Additive only. Does not rewrite any applied migration. Companion to
-- docs/audits/security-audit.md findings H1-H4, M1-M18 (see docs/implementation/
-- master-plan.md Phase 1 for the full mapping).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Session revocation (security-audit H2)
--
-- Bumped whenever a user's role/is_active/password_hash changes. The JWT
-- carries the value it was issued with; requireApiAuth() re-checks it against
-- the DB on every request and rejects a stale session immediately instead of
-- waiting out the 8h maxAge.
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.increment_session_version(
  p_user_id UUID,
  p_tenant_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_new_version INTEGER;
BEGIN
  UPDATE public.users
    SET session_version = session_version + 1
    WHERE id = p_user_id AND tenant_id = p_tenant_id
    RETURNING session_version INTO v_new_version;
  RETURN v_new_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_session_version(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. user_invitations — reconstructing the untracked table (security-audit M11)
--
-- This table already exists in the live database (created outside any
-- migration). CREATE TABLE IF NOT EXISTS documents its real shape without
-- altering it if already present. token_hash is new: invitation tokens are
-- looked up by SHA-256 hash from this migration forward instead of by the
-- plaintext `token` column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id    UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token        UUID        NOT NULL DEFAULT gen_random_uuid(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_invitations
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Backfill: hash any still-pending invite's existing plaintext token so
-- already-sent invite emails keep working after this migration.
UPDATE public.user_invitations
  SET token_hash = encode(digest(token::text, 'sha256'), 'hex')
  WHERE accepted_at IS NULL AND token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invitations_token_hash
  ON public.user_invitations (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_invitations_tenant ON public.user_invitations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_user   ON public.user_invitations (user_id);

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_invitations_select" ON public.user_invitations;
CREATE POLICY "user_invitations_select"
  ON public.user_invitations FOR SELECT
  USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_invitations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_invitations TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Password reset tokens (security-audit L4 — no self-service flow existed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_token_hash
  ON public.password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON public.password_reset_tokens (user_id);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE policy for any role — this table is service-role only
-- (looked up by opaque hash, never listed or browsed by a tenant session).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_tokens TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Durable rate limiting (security-audit H1, M-systemic "no rate limiting")
--
-- Fixed-window counter, keyed by an arbitrary string (e.g. "login:<email>" or
-- "login-ip:<ip>"). rate_limit_hit() is a single atomic statement so concurrent
-- requests can't race past the limit.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          TEXT        PRIMARY KEY,
  count        INTEGER     NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key TEXT,
  p_window_seconds INTEGER,
  p_max INTEGER
) RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_row public.rate_limits%ROWTYPE;
BEGIN
  INSERT INTO public.rate_limits (key, count, window_start)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN public.rate_limits.window_start < NOW() - (p_window_seconds || ' seconds')::INTERVAL
        THEN 1
      ELSE public.rate_limits.count + 1
    END,
    window_start = CASE
      WHEN public.rate_limits.window_start < NOW() - (p_window_seconds || ' seconds')::INTERVAL
        THEN NOW()
      ELSE public.rate_limits.window_start
    END
  RETURNING * INTO v_row;

  RETURN QUERY SELECT
    v_row.count <= p_max,
    GREATEST(p_max - v_row.count, 0),
    GREATEST(EXTRACT(EPOCH FROM (v_row.window_start + (p_window_seconds || ' seconds')::INTERVAL - NOW()))::INTEGER, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) TO service_role;
-- rate_limits itself is never queried directly by the app — only via the function.
GRANT SELECT, INSERT, UPDATE ON public.rate_limits TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Webhook event dedup (security-audit "durable webhook/integration work")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT        NOT NULL,           -- 'ghl' | 'stripe'
  event_id            TEXT        NOT NULL,
  payload_hash        TEXT,
  verification_status TEXT        NOT NULL DEFAULT 'verified',
  processing_status   TEXT        NOT NULL DEFAULT 'pending',
  attempt_count        INTEGER     NOT NULL DEFAULT 0,
  last_error          TEXT,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ,

  CONSTRAINT webhook_events_provider_event_unique UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON public.webhook_events (provider, processing_status);

GRANT SELECT, INSERT, UPDATE ON public.webhook_events TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Durable GHL outbound sync outbox (security-audit L7 — was in-memory only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ghl_sync_outbox (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type           TEXT        NOT NULL,             -- 'opportunity_won' | 'task_create'
  ghl_opportunity_id TEXT        NOT NULL,
  work_order_id      UUID        REFERENCES public.work_orders(id) ON DELETE SET NULL,
  payload            JSONB       NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'pending', -- pending | processing | done | dead_letter
  attempts           INTEGER     NOT NULL DEFAULT 0,
  last_error         TEXT,
  next_attempt_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghl_sync_outbox_ready
  ON public.ghl_sync_outbox (next_attempt_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_ghl_sync_outbox_tenant ON public.ghl_sync_outbox (tenant_id);

CREATE TRIGGER ghl_sync_outbox_updated_at
  BEFORE UPDATE ON public.ghl_sync_outbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.ghl_sync_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ghl_sync_outbox_select" ON public.ghl_sync_outbox;
CREATE POLICY "ghl_sync_outbox_select"
  ON public.ghl_sync_outbox FOR SELECT
  USING (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON public.ghl_sync_outbox TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Extend user_activity_log into the full audit-log shape
-- (security-audit: "Audit logs — Partial", MEMORY.md's own note that the
-- table has no metadata column)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_activity_log
  ADD COLUMN IF NOT EXISTS metadata       JSONB,
  ADD COLUMN IF NOT EXISTS request_id     TEXT,
  ADD COLUMN IF NOT EXISTS source         TEXT NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- 8. RLS fix: work_orders_update wrongly granted UPDATE to read_only_owner
-- (security-audit "RLS review" — read-only roles must never be able to
-- mutate). RLS is currently unreachable in practice (see erd.md), but Phase 1
-- explicitly requires the policies themselves to be correct.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "work_orders_update" ON work_orders;
CREATE POLICY "work_orders_update"
  ON work_orders FOR UPDATE
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner')
  )
  WITH CHECK (tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- 9. Grant verification for the other tables the Phase 0 audit could not
-- confirm have grants (invoices already fixed by 20260617000001; this covers
-- invoice_line_items, which is referenced in application code with no
-- tracked migration at all).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_line_items') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
  END IF;
END $$;
