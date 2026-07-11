// Estimate document domain types (Phase 3). Mirrors migration 20260711000003.
// This REPLACES the dead pre-Phase-2 estimate.ts (deleted in Phase 2); it is a
// real, migrated model, not forward-looking scaffolding.
// All money values are integer cents (see src/lib/money/money.ts).

// ─── Status ───────────────────────────────────────────────────────────────────

export enum EstimateStatus {
  DRAFT = "draft",
  READY = "ready",
  SENT = "sent",
  VIEWED = "viewed",
  ACCEPTED = "accepted",
  DECLINED = "declined",
  EXPIRED = "expired",
  CONVERTED = "converted",
  VOIDED = "voided",
}

export type EstimateLineKind = "standard" | "optional" | "recommended";

// ─── Line item ────────────────────────────────────────────────────────────────

export interface EstimateLineItem {
  id: string;
  estimate_id: string;
  tenant_id: string;
  sort_order: number;
  kind: EstimateLineKind;
  option_group?: string | null;
  is_selected: boolean;

  // Snapshot fields
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number; // cents
  /** cents, internal — stripped by the public serializer and for non-cost roles */
  unit_cost?: number;
  taxable: boolean;
  tax_category?: string | null;
  discount_amount: number; // cents
  markup_percent?: number | null;
  total: number; // cents

  source_pricebook_item_id?: string | null;
  source_pricebook_version?: number | null;

  created_at: string;
}

// ─── Estimate ─────────────────────────────────────────────────────────────────

export interface Estimate {
  id: string;
  tenant_id: string;

  estimate_handoff_id?: string | null;
  work_order_id?: string | null;
  property_id?: string | null;
  ghl_contact_id?: string | null;
  ghl_opportunity_id?: string | null;

  estimate_number: string;
  title: string;
  status: EstimateStatus;

  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;

  issue_date: string;
  expires_at?: string | null;

  assigned_estimator_id?: string | null;
  proposal_template: string;

  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total: number;

  /** staff-only — NEVER present on the public serializer */
  internal_notes?: string | null;
  customer_notes?: string | null;
  terms?: string | null;

  version: number;
  sent_version?: number | null;
  accepted_version?: number | null;

  // Token fields are staff-only (hash is never returned to any client)
  token_expires_at?: string | null;
  token_revoked_at?: string | null;
  has_active_token?: boolean;

  sent_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  converted_at?: string | null;
  voided_at?: string | null;

  decline_reason?: string | null;
  accepted_by_name?: string | null;
  accepted_signature?: string | null;
  terms_acknowledged: boolean;

  locked_at?: string | null;
  locked_by?: string | null;
  converted_invoice_id?: string | null;

  created_by?: string | null;
  created_at: string;
  updated_at: string;

  line_items?: EstimateLineItem[];
}

// ─── Version + event log ──────────────────────────────────────────────────────

export type EstimateVersionType = "draft" | "sent" | "accepted";

export interface EstimateVersion {
  id: string;
  estimate_id: string;
  tenant_id: string;
  version: number;
  version_type: EstimateVersionType;
  snapshot: unknown;
  reason?: string | null;
  created_by?: string | null;
  created_at: string;
}

export type EstimateEventType =
  | "created"
  | "updated"
  | "version_created"
  | "sent"
  | "send_failed"
  | "viewed"
  | "accepted"
  | "declined"
  | "override"
  | "converted"
  | "voided"
  | "token_revoked";

export interface EstimateEvent {
  id: string;
  estimate_id: string;
  tenant_id: string;
  event_type: EstimateEventType;
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

export interface PublicEstimateLineItem {
  id: string;
  kind: EstimateLineKind;
  option_group?: string | null;
  is_selected: boolean;
  name: string;
  description?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number; // cents — customer price only
  taxable: boolean;
  total: number; // cents
  // NO unit_cost, markup, tax_category, or source pricebook pointers
}

export interface PublicEstimate {
  estimate_number: string;
  title: string;
  status: EstimateStatus;
  customer_name: string;
  issue_date: string;
  expires_at?: string | null;
  customer_notes?: string | null;
  terms?: string | null;
  proposal_template: string;

  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total: number;

  line_items: PublicEstimateLineItem[];

  // Tenant branding (public-safe)
  company_name: string;
  company_logo_url?: string | null;
  company_phone?: string | null;
  company_email?: string | null;

  // Decision state (so the public UI can render a completed decision)
  accepted_at?: string | null;
  declined_at?: string | null;
  is_expired: boolean;
  // NO tenant_id, NO ghl ids, NO internal_notes, NO estimator/staff fields
}
