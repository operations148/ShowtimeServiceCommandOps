// Change order domain types (Phase 5). Mirrors migration
// 20260713000001_phase5_work_order_projects_change_orders.sql.
// All money values are integer cents (see src/lib/money/money.ts).

export enum ChangeOrderStatus {
  DRAFT = "draft",
  SENT = "sent",
  VIEWED = "viewed",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  EXPIRED = "expired",
  VOIDED = "voided",
}

export interface ChangeOrderLineItem {
  id: string;
  change_order_id: string;
  tenant_id: string;
  sort_order: number;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number; // cents
  /** cents, internal — stripped by the public serializer and for non-cost roles */
  unit_cost?: number;
  taxable: boolean;
  discount_amount: number; // cents
  total: number; // cents
  source_pricebook_item_id?: string | null;
  source_pricebook_version?: number | null;
  created_at: string;
}

export interface ChangeOrder {
  id: string;
  tenant_id: string;
  work_order_id: string;

  change_order_number: string;
  status: ChangeOrderStatus;
  reason: string;
  scope_description?: string | null;

  customer_name: string;
  customer_email?: string | null;

  /** cents, internal — stripped by redactChangeOrderCosts for non-cost roles */
  cost_impact_cents?: number;
  price_impact_cents: number;
  tax_rate: number;
  tax_impact_cents: number;
  total_impact_cents: number;

  /** Recorded but never auto-applied — dispatch applies it via an explicit action (ADR-0011). */
  schedule_impact_days?: number | null;
  schedule_impact_note?: string | null;
  schedule_impact_applied_at?: string | null;
  schedule_impact_applied_by?: string | null;

  /** Whether an unresolved copy of this change order blocks work-order closeout. */
  blocks_closeout: boolean;

  internal_notes?: string | null;
  customer_notes?: string | null;

  version: number;
  sent_version?: number | null;
  accepted_version?: number | null;

  token_expires_at?: string | null;
  token_revoked_at?: string | null;
  has_active_token?: boolean;

  sent_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  voided_at?: string | null;

  reject_reason?: string | null;
  accepted_by_name?: string | null;
  accepted_signature?: string | null;

  locked_at?: string | null;
  locked_by?: string | null;

  created_by?: string | null;
  created_at: string;
  updated_at: string;

  line_items?: ChangeOrderLineItem[];
}

export type ChangeOrderVersionType = "draft" | "sent" | "accepted";

export interface ChangeOrderVersion {
  id: string;
  change_order_id: string;
  tenant_id: string;
  version: number;
  version_type: ChangeOrderVersionType;
  snapshot: unknown;
  reason?: string | null;
  created_by?: string | null;
  created_at: string;
}

export type ChangeOrderEventType =
  | "created"
  | "updated"
  | "sent"
  | "send_failed"
  | "viewed"
  | "accepted"
  | "rejected"
  | "override"
  | "voided"
  | "contract_value_applied"
  | "schedule_impact_applied"
  | "token_revoked";

export interface ChangeOrderEvent {
  id: string;
  change_order_id: string;
  tenant_id: string;
  event_type: ChangeOrderEventType;
  version?: number | null;
  actor_user_id?: string | null;
  actor_name?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  recipient_email?: string | null;
  preview_mode?: boolean | null;
  test_override?: boolean | null;
  provider_message_id?: string | null;
  error_detail?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

// ─── Public (customer-facing) shape — the ONLY fields safe to expose ──────────

export interface PublicChangeOrderLineItem {
  id: string;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number; // cents — customer price only
  taxable: boolean;
  total: number; // cents
  // NO unit_cost, source pricebook pointers
}

export interface PublicChangeOrder {
  change_order_number: string;
  reason: string;
  scope_description?: string | null;
  status: ChangeOrderStatus;
  customer_name: string;

  price_impact_cents: number;
  tax_impact_cents: number;
  total_impact_cents: number;

  schedule_impact_days?: number | null;
  schedule_impact_note?: string | null;

  customer_notes?: string | null;
  line_items: PublicChangeOrderLineItem[];

  company_name: string;
  company_logo_url?: string | null;
  company_phone?: string | null;
  company_email?: string | null;

  accepted_at?: string | null;
  rejected_at?: string | null;
  is_expired: boolean;
  // NO tenant_id, NO internal_notes, NO cost_impact/unit_cost, NO staff ids
}
