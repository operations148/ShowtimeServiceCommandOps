-- =============================================================================
-- Migration 023 — Phase 3: full estimate/proposal documents
--
-- Additive only. Not applied to any live database by Claude Code.
--
-- The existing `estimate_handoffs` table (technician "needs estimate" flag) is
-- LEFT UNTOUCHED — this migration adds a NEW `estimates` document layer that
-- optionally links back to a handoff, so no technician-flagged data is lost.
--
-- CONTENTS
--   1. estimate_status enum (9-state document lifecycle)
--   2. estimate_line_item_kind enum (standard/optional/recommended)
--   3. estimates            — the financial document (server-computed totals)
--   4. estimate_line_items  — immutable snapshots (reuses Phase 2 snapshot cols)
--   5. estimate_versions    — immutable version snapshots (draft/sent/accepted)
--   6. estimate_events      — activity/approval/send log (append-only)
--   7. invoices.estimate_id partial UNIQUE — idempotent estimate→invoice convert
--   8. RLS, grants, indexes, triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. estimate_status — one authoritative document state machine
-- ---------------------------------------------------------------------------
CREATE TYPE estimate_status AS ENUM (
  'draft',       -- editable working document
  'ready',       -- reviewed, ready to send (still editable)
  'sent',        -- emailed to customer; sent-version snapshot frozen
  'viewed',      -- customer opened the public link
  'accepted',    -- customer accepted; accepted-version locked
  'declined',    -- customer declined (with reason)
  'expired',     -- passed expires_at without decision
  'converted',   -- accepted AND downstream invoice created
  'voided'       -- cancelled by staff (terminal)
);

CREATE TYPE estimate_line_item_kind AS ENUM (
  'standard',    -- always included in totals
  'optional',    -- customer may add; excluded until selected
  'recommended'  -- suggested add-on; excluded until selected
);

-- ---------------------------------------------------------------------------
-- 3. estimates
-- ---------------------------------------------------------------------------
CREATE TABLE estimates (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Links (all optional — an estimate can be standalone)
  estimate_handoff_id   UUID            REFERENCES estimate_handoffs(id) ON DELETE SET NULL,
  work_order_id         UUID            REFERENCES work_orders(id) ON DELETE SET NULL,
  property_id           UUID            REFERENCES properties(id) ON DELETE SET NULL,
  ghl_contact_id        TEXT,
  ghl_opportunity_id    TEXT,

  estimate_number       TEXT            NOT NULL,          -- EST-XXXX, tenant sequence
  title                 TEXT            NOT NULL,
  status                estimate_status NOT NULL DEFAULT 'draft',

  -- Customer operational snapshot (denormalised at creation; never re-fetched)
  customer_name         TEXT            NOT NULL,
  customer_email        TEXT,
  customer_phone        TEXT,
  customer_address      TEXT,

  issue_date            DATE            NOT NULL DEFAULT CURRENT_DATE,
  expires_at            TIMESTAMPTZ,

  assigned_estimator_id UUID            REFERENCES users(id) ON DELETE SET NULL,
  proposal_template     TEXT            NOT NULL DEFAULT 'standard',

  -- Money — integer cents; computed server-side from selected lines only
  subtotal              INTEGER         NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_rate              NUMERIC(7,6)    NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 1),
  tax_amount            INTEGER         NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount       INTEGER         NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total                 INTEGER         NOT NULL DEFAULT 0 CHECK (total >= 0),

  -- Content
  internal_notes        TEXT,           -- staff-only; NEVER exposed publicly
  customer_notes        TEXT,           -- shown on the proposal
  terms                 TEXT,

  -- Optimistic concurrency + version tracking
  version               INTEGER         NOT NULL DEFAULT 1,
  sent_version          INTEGER,        -- snapshot frozen at send
  accepted_version      INTEGER,        -- snapshot frozen at acceptance

  -- Public token (hashed at rest — plaintext only in the emailed URL)
  public_token_hash     TEXT,
  token_expires_at      TIMESTAMPTZ,
  token_revoked_at      TIMESTAMPTZ,

  -- Lifecycle timestamps
  sent_at               TIMESTAMPTZ,
  viewed_at             TIMESTAMPTZ,
  accepted_at           TIMESTAMPTZ,
  declined_at           TIMESTAMPTZ,
  converted_at          TIMESTAMPTZ,
  voided_at             TIMESTAMPTZ,

  -- Decision capture
  decline_reason        TEXT,
  accepted_by_name      TEXT,           -- typed name / signature
  accepted_signature    TEXT,
  accepted_ip           TEXT,
  accepted_user_agent   TEXT,
  terms_acknowledged    BOOLEAN         NOT NULL DEFAULT false,

  -- Locking + conversion idempotency
  locked_at             TIMESTAMPTZ,
  locked_by             UUID            REFERENCES users(id) ON DELETE SET NULL,
  converted_invoice_id  UUID            REFERENCES invoices(id) ON DELETE SET NULL,

  created_by            UUID            REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_estimates_tenant_number ON estimates (tenant_id, estimate_number);
CREATE UNIQUE INDEX idx_estimates_token_hash ON estimates (public_token_hash) WHERE public_token_hash IS NOT NULL;
CREATE INDEX idx_estimates_tenant_status ON estimates (tenant_id, status);
CREATE INDEX idx_estimates_work_order ON estimates (work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_estimates_handoff ON estimates (estimate_handoff_id) WHERE estimate_handoff_id IS NOT NULL;

CREATE TRIGGER estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. estimate_line_items — immutable snapshots (mirrors invoice_line_items)
-- ---------------------------------------------------------------------------
CREATE TABLE estimate_line_items (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id               UUID          NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  tenant_id                 UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  sort_order                INTEGER       NOT NULL DEFAULT 0,
  kind                      estimate_line_item_kind NOT NULL DEFAULT 'standard',
  -- Mutually-exclusive package options share an option_group; at most one may
  -- be selected per group (enforced in application logic + acceptance txn).
  option_group              TEXT,
  is_selected               BOOLEAN       NOT NULL DEFAULT true,  -- standard lines always true

  -- Snapshot fields (from Phase 2 createLineItemSnapshot)
  name                      TEXT          NOT NULL,
  description               TEXT,
  unit                      TEXT,
  quantity                  NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_price                INTEGER       NOT NULL DEFAULT 0,   -- cents
  unit_cost                 INTEGER       NOT NULL DEFAULT 0,   -- cents, internal — never public
  taxable                   BOOLEAN       NOT NULL DEFAULT true,
  tax_category              TEXT,
  discount_amount           INTEGER       NOT NULL DEFAULT 0,   -- cents, per-line
  markup_percent            NUMERIC(7,4),
  total                     INTEGER       NOT NULL DEFAULT 0,   -- cents (qty*price - discount)

  source_pricebook_item_id  UUID          REFERENCES pricebook_items(id) ON DELETE SET NULL,
  source_pricebook_version  INTEGER,

  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_estimate_line_items_estimate ON estimate_line_items (estimate_id, sort_order);
CREATE INDEX idx_estimate_line_items_tenant ON estimate_line_items (tenant_id);

-- ---------------------------------------------------------------------------
-- 5. estimate_versions — immutable full-document snapshots
--    A row is written on every draft save, at send, and at acceptance. The
--    snapshot JSONB is the complete estimate + line items at that version and
--    is NEVER mutated (accepted-version immutability guarantee).
-- ---------------------------------------------------------------------------
CREATE TABLE estimate_versions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id   UUID        NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version       INTEGER     NOT NULL,
  -- 'draft' | 'sent' | 'accepted' — why this snapshot was frozen
  version_type  TEXT        NOT NULL DEFAULT 'draft'
                            CHECK (version_type IN ('draft', 'sent', 'accepted')),
  snapshot      JSONB       NOT NULL,
  reason        TEXT,       -- populated for admin overrides
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (estimate_id, version)
);

CREATE INDEX idx_estimate_versions_estimate ON estimate_versions (estimate_id, version DESC);

-- ---------------------------------------------------------------------------
-- 6. estimate_events — append-only activity / approval / send log
-- ---------------------------------------------------------------------------
CREATE TABLE estimate_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id   UUID        NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- created, updated, version_created, sent, send_failed, viewed, accepted,
  -- declined, override, converted, voided, token_revoked
  event_type    TEXT        NOT NULL,
  version       INTEGER,
  actor_user_id UUID        REFERENCES users(id) ON DELETE SET NULL,  -- NULL for customer/public actions
  actor_name    TEXT,
  ip            TEXT,
  user_agent    TEXT,
  -- Send-log fields (event_type in 'sent'/'send_failed')
  recipient_email TEXT,
  preview_mode  BOOLEAN,
  test_override BOOLEAN,
  provider_message_id TEXT,
  error_detail  TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_estimate_events_estimate ON estimate_events (estimate_id, created_at DESC);
CREATE INDEX idx_estimate_events_tenant ON estimate_events (tenant_id);

-- ---------------------------------------------------------------------------
-- 7. Idempotent estimate → invoice conversion
--    Partial UNIQUE means a second acceptance/conversion of the same estimate
--    hits a 23505 the converter catches and re-fetches — no duplicate invoice.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_estimate_id
  ON invoices (estimate_id) WHERE estimate_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. RLS + grants (defense-in-depth; app traffic uses service_role, which
--    bypasses these — same "designed but currently unreachable" caveat as the
--    rest of the schema, see 20260506000011 architecture note).
-- ---------------------------------------------------------------------------
ALTER TABLE estimates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_versions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_events     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimates_select" ON estimates FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "estimates_write" ON estimates FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner')
  )
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "estimate_line_items_select" ON estimate_line_items FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "estimate_line_items_write" ON estimate_line_items FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner')
  )
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "estimate_versions_select" ON estimate_versions FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "estimate_versions_write" ON estimate_versions FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner')
  )
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "estimate_events_select" ON estimate_events FOR SELECT
  USING (tenant_id = current_tenant_id());
CREATE POLICY "estimate_events_write" ON estimate_events FOR ALL
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('tenant_admin', 'office_staff', 'platform_owner')
  )
  WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON estimates           TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON estimate_line_items TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON estimate_versions   TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON estimate_events     TO service_role, authenticated;

-- =============================================================================
-- ROLLBACK / FORWARD-FIX NOTES
--
-- Additive; nothing existing is altered destructively (estimate_handoffs is
-- untouched). To roll back before any estimates exist:
--   DROP TABLE estimate_events, estimate_versions, estimate_line_items, estimates;
--   DROP INDEX idx_invoices_estimate_id;
--   DROP TYPE estimate_line_item_kind, estimate_status;
-- Once estimates reference invoices via converted_invoice_id, the partial
-- UNIQUE on invoices.estimate_id must stay (it is the conversion idempotency
-- guard). Public tokens can be mass-revoked with:
--   UPDATE estimates SET token_revoked_at = now() WHERE token_revoked_at IS NULL;
-- =============================================================================
