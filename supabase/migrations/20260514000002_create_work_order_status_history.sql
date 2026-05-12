-- =============================================================================
-- Migration 002 (2026-05-14) — work_order_status_history + estimate_notes
-- =============================================================================

-- Audit log for every status change on a work order.
-- Inserted by the PATCH /api/work-orders/[id] route on every status transition.
CREATE TABLE work_order_status_history (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id    UUID         NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  tenant_id        UUID         NOT NULL,
  previous_status  VARCHAR(50),
  new_status       VARCHAR(50)  NOT NULL,
  changed_by_name  TEXT,
  changed_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wo_status_history_work_order ON work_order_status_history (work_order_id, changed_at DESC);
CREATE INDEX idx_wo_status_history_tenant     ON work_order_status_history (tenant_id);

-- Convenience column: estimate notes stored directly on the work order so the
-- Estimates dashboard can display a preview without a second join.
-- estimate_handoffs.notes remains the source of truth for the full record.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS estimate_notes TEXT;
