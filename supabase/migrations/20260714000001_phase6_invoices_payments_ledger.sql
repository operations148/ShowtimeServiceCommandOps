-- =============================================================================
-- Migration — Phase 6: Invoices, Stripe Connect payments, ledger, reconciliation
--
-- Additive only. NOT applied to any live database — application requires
-- explicit approval (same posture as every prior phase migration).
--
-- Contents:
--   1. invoice_status enum extension (5 → 12 values)
--   2. invoices — hardening columns (hashed public token, version, source
--      links/snapshot, kind, void/refund/credit metadata) + estimates FK
--   3. payments — immutable payment/refund/credit ledger
--   4. invoice_events — append-only activity + audit log
--   5. reconciliation_runs / reconciliation_findings
--   6. RLS + grants for new tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. invoice_status enum extension.
--
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is safe here because none of the new
-- values are used in DML within this migration (same technique as Phase 5's
-- work_order_status extension). Existing values (draft, deposit_due,
-- deposit_paid, paid, void) are kept — enum values cannot be removed.
-- 'deposit_paid' becomes a LEGACY value: the consolidated state machine maps
-- it to the partially_paid family and new code never sets it.
-- ---------------------------------------------------------------------------
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'viewed';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'partially_paid';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'overdue';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'refunded';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'credited';

-- ---------------------------------------------------------------------------
-- 2. invoices — Phase 6 hardening columns.
--
-- public_token_hash supersedes the legacy plaintext public_token column
-- (which cannot be dropped additively; it is deprecated and no longer read
-- by any Phase 6 code — new tokens are issued 256-bit random + SHA-256
-- hashed at rest per ADR-0007, via src/lib/security/public-document-token.ts).
-- ---------------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS public_token_hash     TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_revoked_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version               INTEGER      NOT NULL DEFAULT 1,
  -- Source links + immutable creation-time snapshot of the source document
  ADD COLUMN IF NOT EXISTS source_change_order_id UUID        REFERENCES change_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_snapshot        JSONB,
  -- standard | deposit | milestone | final (milestone/progress billing)
  ADD COLUMN IF NOT EXISTS invoice_kind           TEXT        NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS milestone_label        TEXT,
  -- Void / refund / credit metadata (financial records are never hard-deleted)
  ADD COLUMN IF NOT EXISTS voided_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by              UUID        REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason            TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS amount_refunded        INTEGER     NOT NULL DEFAULT 0 CHECK (amount_refunded >= 0),
  ADD COLUMN IF NOT EXISTS credited_amount        INTEGER     NOT NULL DEFAULT 0 CHECK (credited_amount >= 0),
  ADD COLUMN IF NOT EXISTS credit_reason          TEXT;

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoice_kind
  CHECK (invoice_kind IN ('standard', 'deposit', 'milestone', 'final'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_token_hash
  ON invoices (public_token_hash)
  WHERE public_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_source_change_order
  ON invoices (source_change_order_id)
  WHERE source_change_order_id IS NOT NULL;

-- Aging queries: open invoices past due date
CREATE INDEX IF NOT EXISTS idx_invoices_due_date
  ON invoices (tenant_id, due_date)
  WHERE due_date IS NOT NULL;

-- estimates FK reserved since Phase 2 ("FK added when the estimates table
-- lands") — the estimates table landed in Phase 3 but the FK was never added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_estimate_id'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT fk_invoices_estimate_id
      FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. payments — the immutable ledger (ADR-0012).
--
-- Append-only by convention AND by policy: rows record money movement facts
-- (payment / refund / credit) and are never mutated after insert, except the
-- reconciliation_* fields which the reconciliation job may stamp. Corrections
-- are made by appending an offsetting row (refund/credit), never by editing.
-- No full card data is ever stored — provider references only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id                   UUID        NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,

  payment_number               TEXT        NOT NULL,  -- PAY-XXXX via document_sequences('payment')
  kind                         TEXT        NOT NULL DEFAULT 'payment'
                                           CHECK (kind IN ('payment', 'refund', 'credit')),
  -- Always positive; `kind` carries direction (refund/credit reduce amount_paid).
  amount                       INTEGER     NOT NULL CHECK (amount > 0),
  currency                     TEXT        NOT NULL DEFAULT 'usd',

  provider                     TEXT        NOT NULL DEFAULT 'stripe'
                                           CHECK (provider IN ('stripe', 'manual')),
  provider_account_id          TEXT,       -- Stripe connected account (acct_...)
  provider_payment_intent_id   TEXT,
  provider_checkout_session_id TEXT,
  provider_charge_id           TEXT,
  provider_refund_id           TEXT,

  status                       TEXT        NOT NULL DEFAULT 'succeeded'
                                           CHECK (status IN ('pending', 'succeeded', 'failed')),
  failure_code                 TEXT,
  failure_message              TEXT,

  -- A refund row points back at the payment row it reverses.
  refunded_payment_id          UUID        REFERENCES payments(id) ON DELETE SET NULL,

  idempotency_key              TEXT,
  event_source                 TEXT        NOT NULL DEFAULT 'webhook'
                                           CHECK (event_source IN ('webhook', 'manual', 'reconciliation')),

  reconciliation_status        TEXT        NOT NULL DEFAULT 'unreconciled'
                                           CHECK (reconciliation_status IN ('unreconciled', 'reconciled', 'mismatch')),
  reconciled_at                TIMESTAMPTZ,

  metadata                     JSONB,
  created_by                   UUID        REFERENCES users(id) ON DELETE SET NULL,  -- NULL for webhook-originated
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency guards:
--   * one ledger 'payment' row per Stripe PaymentIntent (duplicate webhook → 23505 → adopt)
--   * one row per Stripe refund object
--   * caller-supplied idempotency keys are globally unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_intent_payment
  ON payments (provider_payment_intent_id)
  WHERE provider_payment_intent_id IS NOT NULL AND kind = 'payment';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_refund
  ON payments (provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key
  ON payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_invoice  ON payments (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_tenant   ON payments (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_reconciliation
  ON payments (reconciliation_status)
  WHERE reconciliation_status <> 'reconciled';

-- ---------------------------------------------------------------------------
-- 4. invoice_events — append-only activity/audit log (mirrors
--    estimate_events / change_order_events).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_events (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id           UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id            UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  event_type           TEXT        NOT NULL CHECK (event_type IN (
    'created', 'updated', 'sent', 'send_failed', 'viewed',
    'payment_recorded', 'payment_failed', 'refund_recorded', 'credit_recorded',
    'voided', 'token_revoked', 'overdue_marked',
    'reconciliation_flagged', 'reconciliation_resolved'
  )),

  actor_user_id        UUID        REFERENCES users(id) ON DELETE SET NULL, -- NULL for customer/webhook events
  actor_name           TEXT,
  ip                   TEXT,
  user_agent           TEXT,

  -- Send-log fields
  recipient_email      TEXT,
  preview_mode         BOOLEAN,
  test_override        BOOLEAN,
  provider_message_id  TEXT,
  error_detail         TEXT,

  payment_id           UUID        REFERENCES payments(id) ON DELETE SET NULL,
  metadata             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_events_invoice ON invoice_events (invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_events_tenant  ON invoice_events (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Reconciliation (ADR-0012 §reconciliation).
--
-- Runs are platform-wide (cron or admin-triggered); findings are per-tenant
-- and carry an admin resolution trail.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by      TEXT        NOT NULL DEFAULT 'cron' CHECK (triggered_by IN ('cron', 'manual')),
  triggered_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  invoices_checked  INTEGER     NOT NULL DEFAULT 0,
  payments_checked  INTEGER     NOT NULL DEFAULT 0,
  findings_count    INTEGER     NOT NULL DEFAULT 0,
  error_detail      TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reconciliation_findings (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             UUID        NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id         UUID        REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id         UUID        REFERENCES payments(id) ON DELETE SET NULL,

  finding_type       TEXT        NOT NULL CHECK (finding_type IN (
    'missing_ledger_entry',   -- provider shows a completed payment with no ledger row
    'amount_mismatch',        -- ledger/invoice totals disagree with provider
    'account_mismatch',       -- payment arrived on an unexpected connected account
    'status_mismatch',        -- invoice status inconsistent with ledger sum
    'orphaned_payment'        -- ledger row whose provider object is missing/failed
  )),
  detail             JSONB,

  status             TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  resolved_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  resolved_at        TIMESTAMPTZ,
  resolution_reason  TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_findings_run    ON reconciliation_findings (run_id);
CREATE INDEX IF NOT EXISTS idx_recon_findings_tenant ON reconciliation_findings (tenant_id, status);

-- ---------------------------------------------------------------------------
-- 6. RLS + grants (defense-in-depth; same "designed but currently unreachable
--    for app traffic" caveat as the rest of the schema — the service-role
--    client bypasses RLS and application-layer checks are the active control).
--    reconciliation_runs has no tenant_id (platform-wide) — service_role only.
-- ---------------------------------------------------------------------------
ALTER TABLE payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_findings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payments', 'invoice_events', 'reconciliation_findings']
  LOOP
    EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (tenant_id = current_tenant_id())', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_write" ON %I FOR ALL USING (tenant_id = current_tenant_id() AND current_user_role() IN (''tenant_admin'', ''office_staff'', ''platform_owner'')) WITH CHECK (tenant_id = current_tenant_id())',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO service_role, authenticated', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON reconciliation_runs TO service_role;

-- =============================================================================
-- ROLLBACK / FORWARD-FIX NOTES
--
-- Additive only. Postgres cannot remove enum values, so the invoice_status
-- additions are permanent once applied (expected; matches Phases 2-5 enum
-- practice). New tables can be dropped in reverse dependency order while
-- unused: reconciliation_findings, reconciliation_runs, invoice_events,
-- payments. The invoices column additions are nullable/defaulted and safe to
-- leave in place. The legacy plaintext invoices.public_token column is
-- DEPRECATED but retained (additive-only rule) — no Phase 6 code reads it.
-- =============================================================================
