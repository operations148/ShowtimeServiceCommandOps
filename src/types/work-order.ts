// Work Order Types

export enum WorkOrderStatus {
  NEW = "new",
  ASSIGNED = "assigned",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  NEEDS_FOLLOW_UP = "needs_follow_up",
  ESTIMATE_NEEDED = "estimate_needed",
  CANCELLED = "cancelled",
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
  created_at: string;
  updated_at: string;
}

// status and estimate_handoff_status are optional on create — they default to
// NEW and NOT_NEEDED respectively. All other non-optional fields are required.
export type CreateWorkOrderInput = Omit<
  WorkOrder,
  "id" | "created_at" | "updated_at" | "status" | "estimate_handoff_status"
> & {
  status?: WorkOrderStatus;
  estimate_handoff_status?: EstimateHandoffStatus;
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
export const WORK_ORDER_STATUS_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.NEW]: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.ESTIMATE_NEEDED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.ASSIGNED]: [
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.NEW,
    WorkOrderStatus.ESTIMATE_NEEDED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.IN_PROGRESS]: [
    WorkOrderStatus.COMPLETED,
    WorkOrderStatus.ESTIMATE_NEEDED,
    WorkOrderStatus.NEEDS_FOLLOW_UP,
  ],
  [WorkOrderStatus.COMPLETED]: [WorkOrderStatus.NEEDS_FOLLOW_UP],
  [WorkOrderStatus.ESTIMATE_NEEDED]: [
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.ESTIMATE_NEEDED],
  [WorkOrderStatus.CANCELLED]: [],
};
