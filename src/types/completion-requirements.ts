// Tenant-configured required fields before a visit may be marked complete
// (Phase 5). service_category = null is the tenant-wide default/fallback row.

import type { ServiceCategory } from "@/types/work-order";

export interface CompletionRequirementRule {
  id: string;
  tenant_id: string;
  service_category?: ServiceCategory | null;
  require_checklist_complete: boolean;
  require_photos: boolean;
  require_technician_note: boolean;
  require_customer_signature: boolean;
  require_equipment_reading: boolean;
  require_time_entry: boolean;
  require_material_usage: boolean;
  require_completion_reason: boolean;
  created_at: string;
  updated_at: string;
}

/** The subset of visit completion data the evaluator needs — see src/lib/work-orders/completion-requirements.ts. */
export interface VisitCompletionData {
  checklistComplete: boolean;
  photoCount: number;
  technicianNote?: string | null;
  customerSignature?: string | null;
  equipmentReading?: string | null;
  timeEntryMinutes?: number | null;
  materialUsage?: string | null;
  completionReason?: string | null;
}

export type MissingRequirement =
  | "checklist_complete"
  | "photos"
  | "technician_note"
  | "customer_signature"
  | "equipment_reading"
  | "time_entry"
  | "material_usage"
  | "completion_reason";
