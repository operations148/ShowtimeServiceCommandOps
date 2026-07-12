// Visit Types

export enum VisitStatus {
  SCHEDULED = "scheduled",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  SKIPPED = "skipped",
  RESCHEDULED = "rescheduled",
  CANCELLED = "cancelled",
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  notes?: string;
}

export interface Visit {
  id: string;
  tenant_id: string;
  work_order_id: string;
  property_id: string;
  /** The LEAD technician. Additional technicians live in visit_assignments. */
  technician_id?: string;
  status: VisitStatus;
  scheduled_date: string;
  checklist: ChecklistItem[];
  technician_notes?: string;
  photo_urls: string[];
  completed_at?: string;
  estimate_flagged: boolean;
  completion_message?: string | null;
  completed_by_name?: string | null;
  created_at: string;
  updated_at: string;

  // ── Phase 4 scheduling fields ──────────────────────────────────────────────
  /** UTC instant; derived from tenant-local input at write time. */
  planned_start_at?: string | null;
  planned_end_at?: string | null;
  /** Tenant-local wall times ("HH:MM"). */
  arrival_window_start?: string | null;
  arrival_window_end?: string | null;
  estimated_duration_minutes?: number | null;
  travel_buffer_minutes: number;
  all_day: boolean;
  /** Manual per-technician/day ordering; null = unordered. */
  route_order?: number | null;
  reschedule_reason?: string | null;
  actual_start_at?: string | null;
  /** Optimistic-concurrency token. */
  version: number;
  ghl_appointment_id?: string | null;
  ghl_sync_state: GhlSyncState;

  // ── Phase 5 completion-requirement capture fields ───────────────────────────
  customer_signature?: string | null;
  equipment_reading?: string | null;
  time_entry_minutes?: number | null;
  material_usage?: string | null;
  completion_reason?: string | null;
  checklist_template_id?: string | null;
  checklist_template_version?: number | null;
}

export type GhlSyncState = "none" | "linked" | "pending" | "synced" | "failed";

export interface VisitAssignmentSummary {
  technician_id: string;
  role: "lead" | "assistant";
  name?: string | null;
}

/** Visit enriched with joined property/work-order/assignment context for the calendar + admin views. */
export interface VisitWithSchedule extends Visit {
  property_customer_name?: string | null;
  property_address?: string | null;
  wo_number?: number | null;
  work_order_title?: string | null;
  assignments?: VisitAssignmentSummary[];
}

export type CreateVisitInput = Omit<Visit, "id" | "created_at" | "updated_at">;
export type UpdateVisitInput = Partial<CreateVisitInput>;
