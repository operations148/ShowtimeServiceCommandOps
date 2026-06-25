/**
 * Supabase Database type definitions.
 * Hand-written to match supabase/migrations/. Replace with `supabase gen types typescript`
 * once you have a live Supabase project configured.
 */

// ---------------------------------------------------------------------------
// Enum mirrors — must stay in sync with 001_create_enums.sql
// ---------------------------------------------------------------------------

export type DbUserRole =
  | "platform_owner"
  | "tenant_admin"
  | "office_staff"
  | "technician"
  | "read_only_owner";

export type DbWorkOrderStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "completed"
  | "needs_follow_up"
  | "estimate_needed"
  | "cancelled";

export type DbPriority = "low" | "normal" | "high" | "urgent";

export type DbServiceCategory =
  | "weekly_pool_maintenance"
  | "pool_repair"
  | "pool_inspection_diagnostic"
  | "filter_cleaning"
  | "heater_service"
  | "equipment_installation"
  | "pool_remodel"
  | "new_construction"
  | "emergency_service"
  | "other";

export type DbEstimateHandoffStatus =
  | "not_needed"
  | "flagged"
  | "sent_to_ghl"
  | "estimate_sent"
  | "approved"
  | "declined";

export type DbVisitStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "skipped"
  | "rescheduled"
  | "cancelled";

// ---------------------------------------------------------------------------
// Row types — one interface per table
// ---------------------------------------------------------------------------

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  ghl_location_id: string | null;
  ghl_api_token_encrypted: string | null;
  is_active: boolean;
  plan: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  id: string;
  tenant_id: string;
  auth_provider_id: string | null;
  email: string;
  name: string;
  phone: string | null;
  role: DbUserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PropertyRow {
  id: string;
  tenant_id: string;
  ghl_contact_id: string | null;
  customer_name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  gate_code: string | null;
  access_notes: string | null;
  service_notes: string | null;
  pool_equipment: Record<string, unknown> | null; // JSONB
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkOrderRow {
  id: string;
  tenant_id: string;
  property_id: string;
  wo_number: number;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  title: string;
  description: string | null;
  status: DbWorkOrderStatus;
  priority: DbPriority;
  service_category: DbServiceCategory;
  assigned_technician_id: string | null;
  scheduled_date: string | null;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  completed_at: string | null;
  estimate_handoff_status: DbEstimateHandoffStatus;
  ghl_sync_failed: boolean;
  created_at: string;
  updated_at: string;
}

export interface VisitRow {
  id: string;
  tenant_id: string;
  work_order_id: string;
  property_id: string;
  technician_id: string | null;
  status: DbVisitStatus;
  scheduled_date: string;
  checklist: ChecklistItemJson[] | null; // JSONB — inline checklist snapshot
  technician_notes: string | null;
  photo_urls: string[] | null;
  completed_at: string | null;
  estimate_flagged: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItemJson {
  id: string;
  label: string;
  completed: boolean;
  notes?: string;
}

export interface ChecklistItemRow {
  id: string;
  tenant_id: string;
  visit_id: string;
  label: string;
  completed: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TechnicianNoteRow {
  id: string;
  tenant_id: string;
  visit_id: string;
  technician_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface PhotoRow {
  id: string;
  tenant_id: string;
  visit_id: string;
  work_order_id: string | null;
  property_id: string | null;
  technician_id: string | null;
  storage_path: string;
  public_url: string | null;
  caption: string | null;
  taken_at: string | null;
  created_at: string;
}

export interface EstimateHandoffRow {
  id: string;
  tenant_id: string;
  work_order_id: string;
  visit_id: string | null;
  status: DbEstimateHandoffStatus;
  ghl_task_id: string | null;
  flagged_by_technician_id: string | null;
  flagged_at: string;
  sent_to_ghl_at: string | null;
  estimate_sent_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Database type — used to type the Supabase client
// ---------------------------------------------------------------------------

// Supabase expects every schema to have all five keys.
// Empty records satisfy the constraint without polluting the namespace.
export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: TenantRow;
        Insert: Omit<TenantRow, "id" | "created_at" | "updated_at"> & { id?: string; stripe_charges_enabled?: boolean };
        Update: Partial<Omit<TenantRow, "id" | "created_at">>;
        Relationships: [];
      };
      users: {
        Row: UserRow;
        Insert: Omit<UserRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<UserRow, "id" | "tenant_id" | "created_at">>;
        Relationships: [];
      };
      properties: {
        Row: PropertyRow;
        Insert: Omit<PropertyRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<PropertyRow, "id" | "tenant_id" | "created_at">>;
        Relationships: [];
      };
      work_orders: {
        Row: WorkOrderRow;
        Insert: Omit<WorkOrderRow, "id" | "wo_number" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<WorkOrderRow, "id" | "tenant_id" | "wo_number" | "created_at">>;
        Relationships: [];
      };
      visits: {
        Row: VisitRow;
        Insert: Omit<VisitRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<VisitRow, "id" | "tenant_id" | "created_at">>;
        Relationships: [];
      };
      checklist_items: {
        Row: ChecklistItemRow;
        Insert: Omit<ChecklistItemRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<ChecklistItemRow, "id" | "tenant_id" | "created_at">>;
        Relationships: [];
      };
      technician_notes: {
        Row: TechnicianNoteRow;
        Insert: Omit<TechnicianNoteRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<TechnicianNoteRow, "id" | "tenant_id" | "created_at">>;
        Relationships: [];
      };
      photos: {
        Row: PhotoRow;
        Insert: Omit<PhotoRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<PhotoRow, "id" | "tenant_id" | "created_at">>;
        Relationships: [];
      };
      estimate_handoffs: {
        Row: EstimateHandoffRow;
        Insert: Omit<EstimateHandoffRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<EstimateHandoffRow, "id" | "tenant_id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: DbUserRole;
      work_order_status: DbWorkOrderStatus;
      priority: DbPriority;
      service_category: DbServiceCategory;
      estimate_handoff_status: DbEstimateHandoffStatus;
      visit_status: DbVisitStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
