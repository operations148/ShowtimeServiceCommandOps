-- =============================================================================
-- Migration 019 — Phase 15: invoice_status enum, invoice deposit/handoff columns,
--                           estimate acceptance tokens, Stripe Connect on tenants
--
-- All target tables already exist (created via Supabase dashboard). This
-- migration is purely additive: new enum, ALTER TABLE ADD COLUMN, indexes,
-- RLS policies (RLS is enabled on invoices but has zero policies), and trigger.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUM — invoice_status
-- Replaces the VARCHAR status column on invoices with a proper enum so the
-- DB enforces valid transitions (mirrors InvoiceStatus in src/types/estimate.ts).
-- ---------------------------------------------------------------------------
CREATE TYPE invoice_status AS ENUM (
  'draft',
  'deposit_due',
  'deposit_paid',
  'paid',
  'void'
);

-- Must drop the VARCHAR default before changing type, then restore it as enum
ALTER TABLE invoices ALTER COLUMN status DROP DEFAULT;
ALTER TABLE invoices ALTER COLUMN status TYPE invoice_status USING status::invoice_status;
ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'draft'::invoice_status;

-- ---------------------------------------------------------------------------
-- INVOICES — add Phase 15 deposit + handoff columns
--
-- Column naming follows the existing table convention (no _cents suffix) to
-- stay consistent with the Invoice type in src/types/estimate.ts.
-- ---------------------------------------------------------------------------
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS estimate_handoff_id        UUID        REFERENCES estimate_handoffs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deposit_percent            NUMERIC(5,2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS deposit_amount             INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_required           BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

-- Unique: one invoice per estimate handoff (added separately so IF NOT EXISTS
-- on the ADD COLUMN above doesn't silently skip the constraint if column exists)
ALTER TABLE invoices
  ADD CONSTRAINT invoices_estimate_handoff_id_key UNIQUE (estimate_handoff_id);

ALTER TABLE invoices
  ADD CONSTRAINT chk_deposit_percent_min CHECK (deposit_percent >= 10);

-- updated_at trigger (table was created without one)
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id
  ON invoices (tenant_id);

CREATE INDEX IF NOT EXISTS idx_invoices_work_order_id
  ON invoices (work_order_id)
  WHERE work_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_status
  ON invoices (tenant_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_stripe_pi
  ON invoices (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS policies for invoices
-- RLS is already enabled on the table; zero policies exist — adding them now.
-- Service role (supabaseAdmin) bypasses all policies automatically.
-- ---------------------------------------------------------------------------
CREATE POLICY "invoices_select"
  ON invoices FOR SELECT
  USING (tenant_id = current_tenant_id());

CREATE POLICY "invoices_insert"
  ON invoices FOR INSERT
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner')
  );

CREATE POLICY "invoices_update"
  ON invoices FOR UPDATE
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner')
  )
  WITH CHECK (tenant_id = current_tenant_id());

-- Void (status = 'void') is strongly preferred over hard delete
CREATE POLICY "invoices_delete"
  ON invoices FOR DELETE
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'platform_owner')
  );

-- ---------------------------------------------------------------------------
-- ESTIMATE_HANDOFFS — customer-facing acceptance layer
--
-- accept_token: UUID in the public /estimate/[token] URL.
--   Nullable so existing rows are not retroactively tokenised.
--   Partial UNIQUE index excludes NULLs.
-- locked_at / locked_by: set on customer accept; prevents further edits.
-- ---------------------------------------------------------------------------
ALTER TABLE estimate_handoffs
  ADD COLUMN IF NOT EXISTS accept_token             UUID,
  ADD COLUMN IF NOT EXISTS accept_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by                UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_estimate_handoffs_accept_token
  ON estimate_handoffs (accept_token)
  WHERE accept_token IS NOT NULL;

-- ---------------------------------------------------------------------------
-- TENANTS — Stripe Connect columns
-- ---------------------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_account_id              TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_completed_at TIMESTAMPTZ;
