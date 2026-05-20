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
}

export type CreateVisitInput = Omit<Visit, "id" | "created_at" | "updated_at">;
export type UpdateVisitInput = Partial<CreateVisitInput>;
