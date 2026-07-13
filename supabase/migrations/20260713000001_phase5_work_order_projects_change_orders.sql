-- =============================================================================
-- Migration 025 — Phase 5: work-order project expansion + change orders
--
-- Additive only. Not applied to any live database by Claude Code.
--
-- CONTENTS
--   1. work_order_status enum extension (scheduled, on_hold, closed, archived)
--   2. work_orders: project/archive/contract-value columns
--   3. work_order_tasks (internal tasks)
--   4. work_order_attachments (customer-visible flag, manual/auto source)
--   5. checklist_templates + checklist_template_items (tenant-versioned)
--   6. visits: completion-requirement capture columns + template reference
--   7. visit_checklist_snapshots (immutable, written at visit completion)
--   8. completion_requirement_rules (tenant-configured required fields)
--   9. change_order_status enum + change_orders + change_order_line_items +
--      change_order_versions + change_order_events
--  10. RLS, grants, indexes, triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. work_order_status enum extension
--    Each ADD VALUE is its own statement (required) and is not referenced by
--    any DML in this same migration, so it is safe inside a transaction.
-- ---------------------------------------------------------------------------
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'on_hold';
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'archived';

-- ---------------------------------------------------------------------------
-- 2. work_orders — project, archive, and contract-value columns
-- ---------------------------------------------------------------------------
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS parent_work_order_id           UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_multi_day                    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_cents                    INTEGER CHECK (budget_cents IS NULL OR budget_cents >= 0),
  ADD COLUMN IF NOT EXISTS approved_contract_amount_cents  INTEGER NOT NULL DEFAULT 0 CHECK (approved_contract_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS actual_cost_cents               INTEGER NOT NULL DEFAULT 0 CHECK (actual_cost_cents >= 0),
  ADD COLUMN IF NOT EXISTS customer_notes                  TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes                  TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason             TEXT,
  ADD COLUMN IF NOT EXISTS archived_at                     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by                     UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at                       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by                       UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_at                     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopen_count                    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checklist_template_id           UUID,  -- FK added after checklist_templates exists (below)
  ADD COLUMN IF NOT EXISTS version                         INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT chk_wo_not_own_parent CHECK (parent_work_order_id IS NULL OR parent_work_order_id <> id);

CREATE INDEX IF NOT EXISTS idx_wo_parent ON work_orders (parent_work_order_id) WHERE parent_work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wo_archived ON work_orders (tenant_id, archived_at) WHERE archived_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. work_order_tasks — internal tasks (not customer-visible; distinct from
--    the per-visit checklist).
-- ---------------------------------------------------------------------------
CREATE TABLE work_order_tasks (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_order_id           UUID        NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  title                   TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  is_completed            BOOLEAN     NOT NULL DEFAULT false,
  assigned_technician_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  due_date                DATE,
  sort_order              INTEGER     NOT NULL DEFAULT 0,
  created_by              UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wo_tasks_wo ON work_order_tasks (work_order_id, sort_order);
CREATE INDEX idx_wo_tasks_tenant ON work_order_tasks (tenant_id);

CREATE TRIGGER work_order_tasks_updated_at
  BEFORE UPDATE ON work_order_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. work_order_attachments
--    source: 'manual' (staff-uploaded) | 'auto' (copied in by an
--    attachment rule at WO-creation time — see docs/architecture/erd.md).
-- ---------------------------------------------------------------------------
CREATE TABLE work_order_attachments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_order_id       UUID        NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  file_path           TEXT        NOT NULL,
  file_name           TEXT        NOT NULL,
  mime_type           TEXT        NOT NULL,
  file_size_bytes     INTEGER,
  is_customer_visible BOOLEAN     NOT NULL DEFAULT false,
  source              TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  uploaded_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wo_attachments_wo ON work_order_attachments (work_order_id);
CREATE INDEX idx_wo_attachments_tenant ON work_order_attachments (tenant_id);

-- Auto-attachment rules: at WO creation, any active rule matching the WO's
-- service_category is copied into work_order_attachments with source='auto'.
CREATE TABLE work_order_attachment_rules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_category service_category,  -- NULL = applies to all categories
  file_path        TEXT        NOT NULL,
  file_name        TEXT        NOT NULL,
  mime_type        TEXT        NOT NULL,
  description      TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wo_attachment_rules_tenant ON work_order_attachment_rules (tenant_id, is_active);

-- ---------------------------------------------------------------------------
-- 5. checklist_templates + checklist_template_items — tenant-versioned,
--    overlaying (not replacing) the static config fallback in
--    src/config/checklist-templates.ts. `version` is bumped on every edit
--    (optimistic concurrency, and the provenance value captured in
--    visit_checklist_snapshots).
-- ---------------------------------------------------------------------------
CREATE TABLE checklist_templates (
  id               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_category service_category  NOT NULL,
  name             TEXT              NOT NULL,
  is_active        BOOLEAN           NOT NULL DEFAULT true,
  archived_at      TIMESTAMPTZ,
  version          INTEGER           NOT NULL DEFAULT 1,
  created_by       UUID              REFERENCES users(id) ON DELETE SET NULL,
  updated_by       UUID              REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ       NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service_category)
);

CREATE TRIGGER checklist_templates_updated_at
  BEFORE UPDATE ON checklist_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE checklist_template_items (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id              UUID          NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label                    TEXT          NOT NULL,
  is_required              BOOLEAN       NOT NULL DEFAULT true,
  -- Conditional items: a simple allowlist of service categories this item
  -- additionally applies to beyond the template's own category (kept minimal
  -- — no expression language). NULL = unconditional (always shown).
  conditional_categories   service_category[],
  sort_order               INTEGER       NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_template_items_template ON checklist_template_items (template_id, sort_order);

ALTER TABLE work_orders
  ADD CONSTRAINT fk_wo_checklist_template
  FOREIGN KEY (checklist_template_id) REFERENCES checklist_templates(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6. visits — completion-requirement capture columns
-- ---------------------------------------------------------------------------
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS customer_signature        TEXT,
  ADD COLUMN IF NOT EXISTS equipment_reading         TEXT,
  ADD COLUMN IF NOT EXISTS time_entry_minutes        INTEGER CHECK (time_entry_minutes IS NULL OR time_entry_minutes >= 0),
  ADD COLUMN IF NOT EXISTS material_usage            TEXT,
  ADD COLUMN IF NOT EXISTS completion_reason         TEXT,
  ADD COLUMN IF NOT EXISTS checklist_template_id     UUID REFERENCES checklist_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checklist_template_version INTEGER;

-- ---------------------------------------------------------------------------
-- 7. visit_checklist_snapshots — immutable, written once per completion.
--    items: [{ label, is_required, completed, notes }]
-- ---------------------------------------------------------------------------
CREATE TABLE visit_checklist_snapshots (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  visit_id          UUID        NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  template_id       UUID        REFERENCES checklist_templates(id) ON DELETE SET NULL,
  template_version  INTEGER,
  items             JSONB       NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visit_checklist_snapshots_visit ON visit_checklist_snapshots (visit_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. completion_requirement_rules — tenant-configured required fields before
--    a visit/work order may be marked complete. service_category = NULL
--    means "applies to all categories" (fallback row).
-- ---------------------------------------------------------------------------
CREATE TABLE completion_requirement_rules (
  id                          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_category            service_category, -- NULL = default/all
  require_checklist_complete  BOOLEAN           NOT NULL DEFAULT true,
  require_photos              BOOLEAN           NOT NULL DEFAULT true,
  require_technician_note     BOOLEAN           NOT NULL DEFAULT false,
  require_customer_signature  BOOLEAN           NOT NULL DEFAULT false,
  require_equipment_reading   BOOLEAN           NOT NULL DEFAULT false,
  require_time_entry          BOOLEAN           NOT NULL DEFAULT false,
  require_material_usage      BOOLEAN           NOT NULL DEFAULT false,
  require_completion_reason   BOOLEAN           NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_completion_rules_category
  ON completion_requirement_rules (tenant_id, service_category)
  WHERE service_category IS NOT NULL;

CREATE UNIQUE INDEX idx_completion_rules_default
  ON completion_requirement_rules (tenant_id)
  WHERE service_category IS NULL;

CREATE TRIGGER completion_requirement_rules_updated_at
  BEFORE UPDATE ON completion_requirement_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. Change orders — mirrors the estimates document shape (Phase 3), adapted
--    for work-order scope changes. document_sequences.doc_type already
--    anticipates 'change_order' (added in Phase 2, migration 20260711000002).
-- ---------------------------------------------------------------------------
CREATE TYPE change_order_status AS ENUM (
  'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'voided'
);

CREATE TABLE change_orders (
  id                     UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID                NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_order_id          UUID                NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,

  change_order_number    TEXT                NOT NULL,
  status                 change_order_status NOT NULL DEFAULT 'draft',
  reason                 TEXT                NOT NULL,
  scope_description      TEXT,

  customer_name          TEXT                NOT NULL,
  customer_email         TEXT,

  -- Money — integer cents. Price impact may be negative (a credit/reduction).
  cost_impact_cents      INTEGER             NOT NULL DEFAULT 0,
  price_impact_cents     INTEGER             NOT NULL DEFAULT 0,
  tax_rate               NUMERIC(7,6)        NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 1),
  tax_impact_cents       INTEGER             NOT NULL DEFAULT 0,
  total_impact_cents     INTEGER             NOT NULL DEFAULT 0,

  -- Schedule impact is recorded but NEVER auto-applied — dispatch applies it
  -- explicitly via the existing Phase 4 reschedule endpoint (ADR-0011).
  schedule_impact_days   INTEGER,
  schedule_impact_note   TEXT,
  schedule_impact_applied_at TIMESTAMPTZ,
  schedule_impact_applied_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Whether an unresolved copy of this change order blocks work-order closeout.
  blocks_closeout        BOOLEAN             NOT NULL DEFAULT true,

  internal_notes         TEXT,
  customer_notes         TEXT,

  version                INTEGER             NOT NULL DEFAULT 1,
  sent_version           INTEGER,
  accepted_version       INTEGER,

  public_token_hash      TEXT,
  token_expires_at       TIMESTAMPTZ,
  token_revoked_at       TIMESTAMPTZ,

  sent_at                TIMESTAMPTZ,
  viewed_at              TIMESTAMPTZ,
  accepted_at            TIMESTAMPTZ,
  rejected_at            TIMESTAMPTZ,
  voided_at              TIMESTAMPTZ,

  reject_reason          TEXT,
  accepted_by_name       TEXT,
  accepted_signature     TEXT,
  accepted_ip            TEXT,
  accepted_user_agent    TEXT,

  locked_at              TIMESTAMPTZ,
  locked_by              UUID REFERENCES users(id) ON DELETE SET NULL,

  created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_change_orders_tenant_number ON change_orders (tenant_id, change_order_number);
CREATE UNIQUE INDEX idx_change_orders_token_hash ON change_orders (public_token_hash) WHERE public_token_hash IS NOT NULL;
CREATE INDEX idx_change_orders_wo ON change_orders (work_order_id);
CREATE INDEX idx_change_orders_tenant_status ON change_orders (tenant_id, status);
-- Fast lookup for the closeout-blocking check.
CREATE INDEX idx_change_orders_wo_pending ON change_orders (work_order_id) WHERE status IN ('draft', 'sent', 'viewed');

CREATE TRIGGER change_orders_updated_at
  BEFORE UPDATE ON change_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE change_order_line_items (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id           UUID          NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  tenant_id                 UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sort_order                INTEGER       NOT NULL DEFAULT 0,
  name                      TEXT          NOT NULL,
  description               TEXT,
  unit                      TEXT,
  quantity                  NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_price                INTEGER       NOT NULL DEFAULT 0,  -- cents
  unit_cost                 INTEGER       NOT NULL DEFAULT 0,  -- cents, internal
  taxable                   BOOLEAN       NOT NULL DEFAULT true,
  discount_amount           INTEGER       NOT NULL DEFAULT 0,  -- cents
  total                     INTEGER       NOT NULL DEFAULT 0,  -- cents
  source_pricebook_item_id  UUID          REFERENCES pricebook_items(id) ON DELETE SET NULL,
  source_pricebook_version  INTEGER,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_co_line_items_co ON change_order_line_items (change_order_id, sort_order);
CREATE INDEX idx_co_line_items_tenant ON change_order_line_items (tenant_id);

CREATE TABLE change_order_versions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID      NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version       INTEGER     NOT NULL,
  version_type  TEXT        NOT NULL DEFAULT 'draft' CHECK (version_type IN ('draft', 'sent', 'accepted')),
  snapshot      JSONB       NOT NULL,
  reason        TEXT,
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (change_order_id, version)
);

CREATE INDEX idx_co_versions_co ON change_order_versions (change_order_id, version DESC);

CREATE TABLE change_order_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID        NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,  -- created, updated, sent, send_failed, viewed,
                                          -- accepted, rejected, override, voided,
                                          -- contract_value_applied, schedule_impact_applied,
                                          -- token_revoked
  version         INTEGER,
  actor_user_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_name      TEXT,
  ip              TEXT,
  user_agent      TEXT,
  recipient_email TEXT,
  preview_mode    BOOLEAN,
  test_override   BOOLEAN,
  provider_message_id TEXT,
  error_detail    TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_co_events_co ON change_order_events (change_order_id, created_at DESC);
CREATE INDEX idx_co_events_tenant ON change_order_events (tenant_id);

-- ---------------------------------------------------------------------------
-- 10. RLS + grants (defense-in-depth; same "designed but currently
--     unreachable for app traffic" caveat as the rest of the schema).
-- ---------------------------------------------------------------------------
ALTER TABLE work_order_tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_attachments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_attachment_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_checklist_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE completion_requirement_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_line_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_versions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_events          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'work_order_tasks', 'work_order_attachments', 'work_order_attachment_rules',
    'checklist_templates', 'checklist_template_items', 'visit_checklist_snapshots',
    'completion_requirement_rules', 'change_orders', 'change_order_line_items',
    'change_order_versions', 'change_order_events'
  ]
  LOOP
    EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT USING (tenant_id = current_tenant_id())', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_write" ON %I FOR ALL USING (tenant_id = current_tenant_id() AND current_user_role() IN (''tenant_admin'', ''office_staff'', ''platform_owner'')) WITH CHECK (tenant_id = current_tenant_id())',
      t, t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO service_role, authenticated', t);
  END LOOP;
END $$;

-- =============================================================================
-- ROLLBACK / FORWARD-FIX NOTES
--
-- Additive only. Postgres does not support removing enum values, so the
-- work_order_status and change_order_status additions are permanent once
-- applied — this is expected and matches how estimate_status/pricebook_item_type
-- were introduced in Phases 2-3. New tables can be dropped in reverse
-- dependency order while unused:
--   change_order_events, change_order_versions, change_order_line_items,
--   change_orders, DROP TYPE change_order_status,
--   completion_requirement_rules, visit_checklist_snapshots,
--   checklist_template_items, checklist_templates,
--   work_order_attachment_rules, work_order_attachments, work_order_tasks.
-- =============================================================================
