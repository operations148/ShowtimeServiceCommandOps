// Customer portal types (Phase 7). Mirrors migration
// 20260715000001_phase7_customer_portal.sql.

export interface PortalCustomer {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  phone?: string | null;
  ghl_contact_id?: string | null;
  is_active: boolean;
  session_version: number;
  last_login_at?: string | null;
  invited_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type PortalMagicLinkPurpose = "login" | "invite";

export interface PortalMagicLink {
  id: string;
  portal_customer_id: string;
  tenant_id: string;
  token_hash: string;
  purpose: PortalMagicLinkPurpose;
  expires_at: string;
  consumed_at?: string | null;
  requested_ip?: string | null;
  created_at: string;
}

export interface PortalSession {
  id: string;
  portal_customer_id: string;
  tenant_id: string;
  token_hash: string;
  session_version: number;
  issued_at: string;
  expires_at: string;
  revoked_at?: string | null;
  last_seen_at?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}

export type PortalEventType =
  | "invited"
  | "link_requested"
  | "link_sent"
  | "logged_in"
  | "login_failed"
  | "signed_out"
  | "session_revoked"
  | "sessions_revoked_all"
  | "access_revoked"
  | "profile_updated"
  | "estimate_accepted"
  | "estimate_declined"
  | "change_order_accepted"
  | "change_order_rejected"
  | "invoice_paid"
  | "document_downloaded";

export interface PortalEvent {
  id: string;
  tenant_id: string;
  portal_customer_id?: string | null;
  event_type: PortalEventType;
  actor_user_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

// ─── The trusted portal context resolved on every portal request ──────────────

export interface PortalContext {
  portalCustomerId: string;
  tenantId: string;
  sessionId: string;
  email: string;
  name: string;
  /** Property ids this customer is authorized to see. */
  propertyIds: string[];
}

// ─── Public (customer-facing) shapes served by the portal ─────────────────────
// These carry ONLY approved customer-facing data — the same allowlist
// discipline as the public estimate/change-order/invoice serializers.

export interface PortalCustomerProfile {
  email: string;
  name: string;
  phone?: string | null;
}

export interface PortalPropertySummary {
  id: string;
  customer_name: string;
  address: string;
  // NO gate_code, access_notes, service_notes, equipment internals, tenant_id
}

export interface PortalSessionSummary {
  id: string;
  issued_at: string;
  last_seen_at?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  current: boolean;
  // NO token_hash
}

export interface PortalBranding {
  company_name: string;
  company_logo_url?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  /** Tenant-configured GHL booking deep link, when set. */
  booking_url?: string | null;
}
