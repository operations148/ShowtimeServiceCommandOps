-- =============================================================================
-- Migration 022 — Phase 2: schema reconciliation baseline, tenant-safe document
--                  sequences, pricebook, and line-item snapshot foundation
--
-- Additive only. Not applied to any live database by Claude Code — apply via
-- the normal review + supabase db push flow.
--
-- CONTENTS
--   1. Baseline CREATE TABLE IF NOT EXISTS for invoices + invoice_line_items
--      (schema reconciliation: these were created via the Supabase dashboard
--      and never tracked; this codifies the shape the application code
--      expects. On the live DB every statement here is a no-op.)
--   2. document_sequences + next_document_number() — atomic, tenant-scoped,
--      transaction-safe numbering that replaces app-layer COUNT(*)+1.
--   3. Pricebook: pricebook_categories, pricebook_items, pricebook_bundle_items.
--   4. Snapshot columns on invoice_line_items (foundation for immutable
--      estimate/change-order/invoice line items in Phases 3+).
--   5. RLS policies, grants, indexes, updated_at triggers.
--
-- FRESH-ENVIRONMENT CAVEAT (known, pre-existing): migration 20260613000001
-- ALTERs the dashboard-created invoices table and will fail on an empty
-- database. This migration is self-sufficient (guarded enum creation +
-- IF NOT EXISTS), but full from-scratch provisioning still requires a schema
-- dump of the live DB or a guarded fix to 019 — deliberately NOT done here
-- because rewriting an applied migration is prohibited. Tracked in
-- docs/implementation/master-plan.md.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1a. invoice_status enum — created by 20260613000001 on the live DB; guarded
--     here so this migration stands alone on fresh environments.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM ('draft', 'deposit_due', 'deposit_paid', 'paid', 'void');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1b. invoices — baseline. Mirrors the authoritative Invoice type in
--     src/types/invoice.ts (the 5-state enum model; the conflicting 7-state
--     model in src/types/estimate.ts was dead code and has been deleted).
--     No-op on the live DB where the dashboard-created table already exists.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID           NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  estimate_handoff_id         UUID           REFERENCES estimate_handoffs(id) ON DELETE SET NULL,
  estimate_id                 UUID,          -- reserved: FK added when the estimates table lands (Phase 3)
  work_order_id               UUID           REFERENCES work_orders(id) ON DELETE SET NULL,
  property_id                 UUID           REFERENCES properties(id) ON DELETE SET NULL,
  ghl_contact_id              TEXT,
  ghl_opportunity_id          TEXT,

  invoice_number              TEXT           NOT NULL,
  title                       TEXT           NOT NULL,
  status                      invoice_status NOT NULL DEFAULT 'draft',

  customer_name               TEXT           NOT NULL,
  customer_email              TEXT,
  customer_phone              TEXT,
  customer_address            TEXT,

  issue_date                  DATE           NOT NULL DEFAULT CURRENT_DATE,
  due_date                    DATE,
  sent_at                     TIMESTAMPTZ,
  viewed_at                   TIMESTAMPTZ,
  paid_at                     TIMESTAMPTZ,

  -- Money: integer cents everywhere; tax_rate/deposit_percent are the two
  -- deliberate NUMERIC exceptions (rates, not amounts).
  subtotal                    INTEGER        NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_rate                    NUMERIC(7,6)   NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 1),
  tax_amount                  INTEGER        NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount             INTEGER        NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total                       INTEGER        NOT NULL DEFAULT 0 CHECK (total >= 0),
  amount_paid                 INTEGER        NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_due                  INTEGER        NOT NULL DEFAULT 0,

  deposit_percent             NUMERIC(5,2)   NOT NULL DEFAULT 10,
  deposit_amount              INTEGER        NOT NULL DEFAULT 0,
  deposit_required            BOOLEAN        NOT NULL DEFAULT true,

  notes                       TEXT,
  terms                       TEXT,
  payment_instructions        TEXT,

  stripe_payment_intent_id    TEXT,
  stripe_payment_link         TEXT,
  stripe_checkout_session_id  TEXT,

  public_token                TEXT           NOT NULL DEFAULT gen_random_uuid()::text,

  created_by                  UUID           REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_public_token
  ON invoices (public_token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_number
  ON invoices (tenant_id, invoice_number);

-- ---------------------------------------------------------------------------
-- 1c. invoice_line_items — baseline (legacy shape used by
--     src/lib/invoicing/create-invoice-from-estimate.ts), then snapshot
--     columns added in section 4 via ADD COLUMN IF NOT EXISTS so both the
--     fresh-created and pre-existing dashboard table end up identical.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID         NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  description TEXT         NOT NULL,
  details     TEXT,
  quantity    NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_price  INTEGER      NOT NULL DEFAULT 0,  -- cents
  total       INTEGER      NOT NULL DEFAULT 0,  -- cents
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice
  ON invoice_line_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_tenant
  ON invoice_line_items (tenant_id);

-- ---------------------------------------------------------------------------
-- 2. Tenant-safe document numbering
--
-- Replaces COUNT(*)+1 (race-prone: two concurrent creators read the same
-- count and both produce e.g. INV-0007).
--
-- CONCURRENCY BEHAVIOR (documented per Phase 2 requirement):
--   next_document_number() is a single INSERT ... ON CONFLICT DO UPDATE
--   statement. Postgres takes a row-level lock on the (tenant_id, doc_type)
--   row for the duration of the statement; concurrent callers serialize on
--   that lock and each receives a distinct, monotonically increasing value.
--   Two callers can never receive the same number.
--
--   Gap behavior: supabase-js calls run in autocommit mode, so a claimed
--   number is committed immediately. If the caller's subsequent document
--   INSERT fails, that number is skipped (a gap) — never reused. Gaps are
--   acceptable; duplicates are not. (Inside an explicit transaction the
--   claim would roll back with the document, gapless, at the cost of holding
--   the row lock until commit.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_sequences (
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_type   TEXT        NOT NULL CHECK (doc_type IN ('invoice', 'estimate', 'change_order', 'payment')),
  next_value BIGINT      NOT NULL DEFAULT 1 CHECK (next_value >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, doc_type)
);

-- next_value semantics: the NEXT number to hand out. The UPSERT hands out the
-- pre-increment value: first call inserts next_value=2 and returns 1.
CREATE OR REPLACE FUNCTION next_document_number(p_tenant_id UUID, p_doc_type TEXT)
  RETURNS BIGINT
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  INSERT INTO document_sequences (tenant_id, doc_type, next_value)
  VALUES (p_tenant_id, p_doc_type, 2)
  ON CONFLICT (tenant_id, doc_type)
  DO UPDATE SET next_value = document_sequences.next_value + 1,
                updated_at = now()
  RETURNING next_value - 1;
$$;

-- Sequences are server-owned: no browser/API-key path may claim numbers.
REVOKE EXECUTE ON FUNCTION next_document_number(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION next_document_number(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION next_document_number(UUID, TEXT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION next_document_number(UUID, TEXT) TO service_role;

-- Deny-all RLS: enabled with zero policies. Only service_role (which
-- bypasses RLS) touches this table.
ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_sequences TO service_role;

-- BACKFILL: seed the invoice sequence above any numbers already issued by
-- the old COUNT(*)+1 logic, so the first sequence-issued number never
-- collides. Parses digits out of existing invoice_number values (INV-0042 →
-- 42) and starts at max+1. No-op when the invoices table is empty.
INSERT INTO document_sequences (tenant_id, doc_type, next_value)
SELECT
  tenant_id,
  'invoice',
  COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::bigint), 0) + 1
FROM invoices
GROUP BY tenant_id
ON CONFLICT (tenant_id, doc_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3a. pricebook_item_type enum
-- ---------------------------------------------------------------------------
CREATE TYPE pricebook_item_type AS ENUM (
  'service', 'labor', 'material', 'equipment', 'fee', 'discount', 'bundle'
);

-- ---------------------------------------------------------------------------
-- 3b. pricebook_categories
-- ---------------------------------------------------------------------------
CREATE TABLE pricebook_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ,
  version     INTEGER     NOT NULL DEFAULT 1,  -- optimistic concurrency
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX idx_pricebook_categories_tenant
  ON pricebook_categories (tenant_id, sort_order);

CREATE TRIGGER pricebook_categories_updated_at
  BEFORE UPDATE ON pricebook_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3c. pricebook_items
--
-- customer_price / internal_cost: integer cents. Discounts are stored as
-- positive amounts with item_type='discount' and applied subtractively at
-- the document layer — no negative prices in the pricebook.
-- version: bumped on every successful update; doubles as the optimistic-
-- concurrency token and the snapshot source_pricebook_version.
-- ---------------------------------------------------------------------------
CREATE TABLE pricebook_items (
  id               UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID                NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id      UUID                REFERENCES pricebook_categories(id) ON DELETE SET NULL,
  item_type        pricebook_item_type NOT NULL DEFAULT 'service',
  name             TEXT                NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description      TEXT,
  unit             TEXT,               -- 'each', 'hour', 'sq ft', 'gallon', ...
  default_quantity NUMERIC(12,3)       NOT NULL DEFAULT 1 CHECK (default_quantity >= 0),
  customer_price   INTEGER             NOT NULL DEFAULT 0 CHECK (customer_price >= 0),  -- cents
  internal_cost    INTEGER             NOT NULL DEFAULT 0 CHECK (internal_cost >= 0),   -- cents
  taxable          BOOLEAN             NOT NULL DEFAULT true,
  tax_category     TEXT,
  vendor_reference TEXT,
  image_path       TEXT,               -- Supabase Storage path via the Phase 1 secure pipeline
  notes            TEXT,
  is_active        BOOLEAN             NOT NULL DEFAULT true,
  sort_order       INTEGER             NOT NULL DEFAULT 0,
  archived_at      TIMESTAMPTZ,        -- soft delete: archived items never hard-deleted
  version          INTEGER             NOT NULL DEFAULT 1,
  created_by       UUID                REFERENCES users(id) ON DELETE SET NULL,
  updated_by       UUID                REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricebook_items_tenant_active
  ON pricebook_items (tenant_id, is_active) WHERE archived_at IS NULL;

CREATE INDEX idx_pricebook_items_tenant_type
  ON pricebook_items (tenant_id, item_type);

CREATE INDEX idx_pricebook_items_tenant_category
  ON pricebook_items (tenant_id, category_id);

CREATE INDEX idx_pricebook_items_tenant_name
  ON pricebook_items (tenant_id, lower(name));

CREATE TRIGGER pricebook_items_updated_at
  BEFORE UPDATE ON pricebook_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3d. pricebook_bundle_items — children of item_type='bundle' packages.
--     Child prices/costs are snapshotted at document time, not here; the
--     bundle rows only define composition.
-- ---------------------------------------------------------------------------
CREATE TABLE pricebook_bundle_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bundle_id     UUID          NOT NULL REFERENCES pricebook_items(id) ON DELETE CASCADE,
  child_item_id UUID          NOT NULL REFERENCES pricebook_items(id) ON DELETE RESTRICT,
  quantity      NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sort_order    INTEGER       NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, child_item_id),
  CHECK (bundle_id <> child_item_id)
);

CREATE INDEX idx_pricebook_bundle_items_bundle
  ON pricebook_bundle_items (bundle_id);

-- ---------------------------------------------------------------------------
-- 4. Line-item snapshot foundation on invoice_line_items.
--    Snapshots retain everything needed to reproduce the line without the
--    source pricebook item: name/description/unit/qty/price/cost/tax/
--    discount/markup/total + source id and source version. Editing or
--    archiving the pricebook item NEVER mutates existing document lines.
-- ---------------------------------------------------------------------------
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS unit                     TEXT,
  ADD COLUMN IF NOT EXISTS unit_cost                INTEGER,        -- cents; internal, never customer-facing
  ADD COLUMN IF NOT EXISTS taxable                  BOOLEAN,
  ADD COLUMN IF NOT EXISTS tax_category             TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount          INTEGER NOT NULL DEFAULT 0,  -- cents, per-line
  ADD COLUMN IF NOT EXISTS markup_percent           NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS source_pricebook_item_id UUID REFERENCES pricebook_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_pricebook_version INTEGER;

-- ---------------------------------------------------------------------------
-- 5. RLS + grants for pricebook tables (defense-in-depth; all application
--    traffic uses service_role which bypasses these — see 20260506000011
--    architecture note).
-- ---------------------------------------------------------------------------
ALTER TABLE pricebook_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricebook_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricebook_bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricebook_categories_select" ON pricebook_categories FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "pricebook_categories_write" ON pricebook_categories FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner')
  )
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "pricebook_items_select" ON pricebook_items FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "pricebook_items_write" ON pricebook_items FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner')
  )
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "pricebook_bundle_items_select" ON pricebook_bundle_items FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "pricebook_bundle_items_write" ON pricebook_bundle_items FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner')
  )
  WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON pricebook_categories   TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pricebook_items        TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pricebook_bundle_items TO service_role, authenticated;

-- =============================================================================
-- ROLLBACK / FORWARD-FIX NOTES
--
-- This migration is additive; nothing existing is altered destructively.
-- To roll forward out of a bad state:
--   - Sequences: document_sequences rows can be corrected with a plain UPDATE
--     (next_value must be set ABOVE the highest issued number, never below).
--   - Pricebook: DROP TABLE pricebook_bundle_items, pricebook_items,
--     pricebook_categories; DROP TYPE pricebook_item_type — safe only while
--     no invoice_line_items.source_pricebook_item_id references exist.
--   - Snapshot columns on invoice_line_items are nullable/defaulted; they can
--     be ignored by older code and are safe to leave in place.
--   - Baseline CREATE TABLE IF NOT EXISTS sections are no-ops on the live DB
--     and require no rollback.
-- =============================================================================
