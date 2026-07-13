// Work Order Types

export enum WorkOrderStatus {
  NEW = "new",
  ASSIGNED = "assigned",
  SCHEDULED = "scheduled",
  IN_PROGRESS = "in_progress",
  ON_HOLD = "on_hold",
  COMPLETED = "completed",
  NEEDS_FOLLOW_UP = "needs_follow_up",
  ESTIMATE_NEEDED = "estimate_needed",
  CLOSED = "closed",
  CANCELLED = "cancelled",
  ARCHIVED = "archived",
}

export enum Priority {
  LOW = "low",
  NORMAL = "normal",
  HIGH = "high",
  URGENT = "urgent",
}

export enum ServiceCategory {
  WEEKLY_POOL_MAINTENANCE = "weekly_pool_maintenance",
  POOL_REPAIR = "pool_repair",
  POOL_INSPECTION_DIAGNOSTIC = "pool_inspection_diagnostic",
  FILTER_CLEANING = "filter_cleaning",
  HEATER_SERVICE = "heater_service",
  EQUIPMENT_INSTALLATION = "equipment_installation",
  POOL_REMODEL = "pool_remodel",
  NEW_CONSTRUCTION = "new_construction",
  EMERGENCY_SERVICE = "emergency_service",
  OTHER = "other",
}

// Tracks the estimate handoff state machine independently of work order status.
// Allows granular tracking even after the work order moves to other states.
export enum EstimateHandoffStatus {
  NOT_NEEDED = "not_needed",
  FLAGGED = "flagged",
  SENT_TO_GHL = "sent_to_ghl",
  ESTIMATE_SENT = "estimate_sent",
  APPROVED = "approved",
  DECLINED = "declined",
}

export interface WorkOrder {
  id: string;
  tenant_id: string;
  property_id: string;
  ghl_contact_id?: string;
  ghl_opportunity_id?: string;
  title: string;
  description?: string;
  status: WorkOrderStatus;
  priority: Priority;
  service_category: ServiceCategory;
  assigned_technician_id?: string;
  scheduled_date?: string;       // ISO date string: "YYYY-MM-DD"
  scheduled_time_start?: string; // "HH:MM"
  scheduled_time_end?: string;   // "HH:MM"
  completed_at?: string;         // ISO datetime string
  estimate_handoff_status: EstimateHandoffStatus;
  estimate_notes?: string;
  /** Set true when an outbound GHL sync attempt failed after all retries.
   *  Cleared automatically if a subsequent sync succeeds. */
  ghl_sync_failed?: boolean;
  /** Set on WOs auto-generated from a recurring schedule; null on manual WOs. */
  recurring_schedule_id?: string;
  /** GHL pipeline stage name that triggered this work order's creation (e.g. "Diagnosis Booked"). */
  ghl_trigger_stage?: string;
  /** Final completion notes written by the technician when marking the job done. */
  tech_completion_message?: string | null;
  tech_completed_by?: string | null;
  tech_completed_at?: string | null;

  // ── Phase 5 project/archive fields ─────────────────────────────────────────
  /** Set for a child work order in a multi-day/multi-visit project. */
  parent_work_order_id?: string | null;
  is_multi_day: boolean;
  budget_cents?: number | null;
  /** Contract value. Updated automatically when a change order is accepted (ADR-0011). */
  approved_contract_amount_cents: number;
  /** Rolls up actual time/material cost; job-costing wiring is a later phase. */
  actual_cost_cents: number;
  customer_notes?: string | null;
  internal_notes?: string | null;
  cancellation_reason?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  reopened_at?: string | null;
  reopen_count: number;
  checklist_template_id?: string | null;
  /** Optimistic-concurrency token. */
  version: number;

  created_at: string;
  updated_at: string;
}

// status and estimate_handoff_status are optional on create — they default to
// NEW and NOT_NEEDED respectively. Phase 5 project/archive fields are all
// server-defaulted (false/0/1) and therefore optional on create too.
export type CreateWorkOrderInput = Omit<
  WorkOrder,
  | "id" | "created_at" | "updated_at" | "status" | "estimate_handoff_status"
  | "is_multi_day" | "approved_contract_amount_cents" | "actual_cost_cents" | "reopen_count" | "version"
> & {
  status?: WorkOrderStatus;
  estimate_handoff_status?: EstimateHandoffStatus;
  is_multi_day?: boolean;
  approved_contract_amount_cents?: number;
  actual_cost_cents?: number;
  reopen_count?: number;
  version?: number;
};

export type UpdateWorkOrderInput = Partial<
  Omit<WorkOrder, "id" | "tenant_id" | "created_at" | "updated_at">
>;

// Enriched type for list views and detail views — joined with property and technician names.
export interface WorkOrderWithRelations extends WorkOrder {
  wo_number: string; // e.g. "WO-0042" — auto-generated display ID
  property_address: string;
  property_customer_name: string;
  assigned_technician_name?: string;
}

// Allowed status transitions. Key = current status, value = allowed next statuses.
// Used for validation in API routes and UI button state.
//
// Phase 5 extended this from 7 to 11 states (scheduled/on_hold/closed/archived
// added). CLOSED -> NEEDS_FOLLOW_UP is the "reopen" path — gated in practice
// behind the dedicated reopenWorkOrder action (which also records
// reopened_at/reopen_count), not exposed as a bare status PATCH.
// CANCELLED/CLOSED -> ARCHIVED is the "archive instead of hard-delete" path;
// ARCHIVED is terminal (see src/lib/work-orders/state-machine.ts for helpers).
export const WORK_ORDER_STATUS_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.NEW]: [
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.SCHEDULED,
    WorkOrderStatus.ESTIMATE_NEEDED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.ASSIGNED]: [
    WorkOrderStatus.NEW,
    WorkOrderStatus.SCHEDULED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.ON_HOLD,
    WorkOrderStatus.ESTIMATE_NEEDED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.SCHEDULED]: [
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.ON_HOLD,
    WorkOrderStatus.ESTIMATE_NEEDED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.IN_PROGRESS]: [
    WorkOrderStatus.COMPLETED,
    WorkOrderStatus.ON_HOLD,
    WorkOrderStatus.ESTIMATE_NEEDED,
    WorkOrderStatus.NEEDS_FOLLOW_UP,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.ON_HOLD]: [
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.SCHEDULED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.ESTIMATE_NEEDED]: [
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: [
    WorkOrderStatus.ASSIGNED,
    WorkOrderStatus.SCHEDULED,
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.ESTIMATE_NEEDED,
  ],
  [WorkOrderStatus.COMPLETED]: [WorkOrderStatus.NEEDS_FOLLOW_UP, WorkOrderStatus.CLOSED],
  [WorkOrderStatus.CLOSED]: [WorkOrderStatus.NEEDS_FOLLOW_UP, WorkOrderStatus.ARCHIVED],
  [WorkOrderStatus.CANCELLED]: [WorkOrderStatus.ARCHIVED],
  [WorkOrderStatus.ARCHIVED]: [],
};
