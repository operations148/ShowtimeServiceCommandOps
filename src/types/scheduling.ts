// Scheduling domain types (Phase 4). Mirrors migration 20260712000001.

export interface BlockedTime {
  id: string;
  tenant_id: string;
  technician_id: string;
  starts_at: string; // UTC
  ends_at: string; // UTC
  all_day: boolean;
  reason?: string | null;
  version: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TechnicianAvailability {
  id: string;
  tenant_id: string;
  technician_id: string;
  day_of_week: number; // 0=Sunday..6
  start_time: string; // tenant-local "HH:MM"
  end_time: string;
  created_at: string;
}

export interface RecurringException {
  id: string;
  tenant_id: string;
  schedule_id: string;
  exception_date: string; // tenant-local "YYYY-MM-DD"
  reason?: string | null;
  created_by?: string | null;
  created_at: string;
}

export type ScheduleEventType =
  | "assigned"
  | "reassigned"
  | "rescheduled"
  | "route_reordered"
  | "blocked_time_created"
  | "blocked_time_deleted"
  | "schedule_paused"
  | "schedule_resumed"
  | "occurrence_skipped"
  | "occurrence_generated";

export interface ScheduleEvent {
  id: string;
  tenant_id: string;
  visit_id?: string | null;
  schedule_id?: string | null;
  event_type: ScheduleEventType;
  actor_user_id?: string | null;
  reason?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  created_at: string;
}

export interface CronRun {
  id: string;
  job_name: string;
  started_at: string;
  finished_at?: string | null;
  status: "running" | "succeeded" | "failed";
  totals?: Record<string, unknown> | null;
  by_tenant?: Record<string, unknown> | null;
  error?: string | null;
  created_at: string;
}
