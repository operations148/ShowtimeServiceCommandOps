-- =============================================================================
-- TEST-ONLY PRE-HISTORY BASELINE — `invoices`
--
-- NOT A PRODUCTION MIGRATION. Never move this into supabase/migrations/.
-- Never apply to production. See ../README.md for full rationale.
--
-- Models the state of `invoices` immediately BEFORE
--   supabase/migrations/20260613000001_invoices.sql
-- i.e. the dashboard-created table as it existed before any tracked migration
-- touched it. That migration's own header records this:
--   "All target tables already exist (created via Supabase dashboard)."
--
-- Insertion point: applied immediately before 20260613000001_invoices.sql,
-- NOT at the very start of the sequence — tenants/users/properties/work_orders
-- are created by the 20260506* migrations and must already exist for these
-- foreign keys to resolve.
--
-- DELIBERATELY OMITTED (later tracked migrations add these — omitting them
-- keeps those migrations doing real work instead of silently no-opping):
--   20260613000001 : estimate_handoff_id, deposit_percent, deposit_amount,
--                    deposit_required, stripe_checkout_session_id;
--                    the invoice_status ENUM; the status column's conversion
--                    TEXT -> invoice_status; the updated_at trigger (that
--                    migration notes "table was created without one"); all
--                    RLS policies; all indexes.
--   20260711000003 : UNIQUE index on estimate_id.
--   20260714000001 : fk_invoices_estimate_id; public_token_hash,
--                    token_expires_at, token_revoked_at, version,
--                    source_change_order_id, source_snapshot, invoice_kind,
--                    milestone_label, voided_at, voided_by, void_reason,
--                    refunded_at, amount_refunded, credited_amount,
--                    credit_reason.
--
-- Column set below = live production shape MINUS every column any tracked
-- migration adds, derived from read-only PostgREST schema metadata. No rows.
-- =============================================================================

CREATE TABLE invoices (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  work_order_id            UUID          REFERENCES work_orders(id) ON DELETE SET NULL,
  property_id              UUID          REFERENCES properties(id) ON DELETE SET NULL,
  ghl_contact_id           TEXT,
  ghl_opportunity_id       TEXT,

  invoice_number           TEXT          NOT NULL,
  title                    TEXT          NOT NULL,

  -- TEXT, deliberately NOT the invoice_status enum: 20260613000001 creates
  -- that type and converts this column with
  --   ALTER COLUMN status TYPE invoice_status USING status::invoice_status
  -- after first dropping this default. Both statements need a castable
  -- text-ish column with a default present to operate on.
  status                   TEXT          NOT NULL DEFAULT 'draft',

  customer_name            TEXT          NOT NULL,
  customer_email           TEXT,
  customer_phone           TEXT,
  customer_address         TEXT,

  issue_date               DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date                 DATE,
  sent_at                  TIMESTAMPTZ,
  viewed_at                TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,

  subtotal                 INTEGER       NOT NULL DEFAULT 0,
  tax_rate                 NUMERIC(7,6)  NOT NULL DEFAULT 0,
  tax_amount               INTEGER       NOT NULL DEFAULT 0,
  discount_amount          INTEGER       NOT NULL DEFAULT 0,
  total                    INTEGER       NOT NULL DEFAULT 0,
  amount_paid              INTEGER       NOT NULL DEFAULT 0,
  amount_due               INTEGER       NOT NULL DEFAULT 0,

  notes                    TEXT,
  terms                    TEXT,
  payment_instructions     TEXT,

  stripe_payment_intent_id TEXT,
  stripe_payment_link      TEXT,
  public_token             TEXT          NOT NULL,

  -- Plain UUID with NO foreign key here on purpose: `estimates` does not exist
  -- until 20260711000003 (a month later), and the FK constraint itself is
  -- added by 20260714000001 as fk_invoices_estimate_id.
  estimate_id              UUID,

  created_by               UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 20260613000001's header records that RLS was already enabled on this table
-- with zero policies; that migration then adds the policies.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
