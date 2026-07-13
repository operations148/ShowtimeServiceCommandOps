import type {
  CompletionRequirementRule,
  MissingRequirement,
  VisitCompletionData,
} from "@/types/completion-requirements";

/**
 * Tenant-configured completion-requirement evaluator (Phase 5). A visit
 * cannot be marked complete while any configured-required field is missing.
 * Pure function: the caller resolves the applicable rule (service-category
 * row, falling back to the tenant's default row, falling back to
 * `DEFAULT_RULE` when the tenant has configured nothing) and passes in the
 * visit's current completion data.
 */

/** Sane baseline when a tenant has configured no rules at all. */
export const DEFAULT_COMPLETION_RULE: Omit<
  CompletionRequirementRule,
  "id" | "tenant_id" | "service_category" | "created_at" | "updated_at"
> = {
  require_checklist_complete: true,
  require_photos: true,
  require_technician_note: false,
  require_customer_signature: false,
  require_equipment_reading: false,
  require_time_entry: false,
  require_material_usage: false,
  require_completion_reason: false,
};

export interface CompletionCheckResult {
  canComplete: boolean;
  missing: MissingRequirement[];
}

export function evaluateCompletionRequirements(
  rule: Pick<
    CompletionRequirementRule,
    | "require_checklist_complete"
    | "require_photos"
    | "require_technician_note"
    | "require_customer_signature"
    | "require_equipment_reading"
    | "require_time_entry"
    | "require_material_usage"
    | "require_completion_reason"
  >,
  data: VisitCompletionData
): CompletionCheckResult {
  const missing: MissingRequirement[] = [];

  if (rule.require_checklist_complete && !data.checklistComplete) missing.push("checklist_complete");
  if (rule.require_photos && data.photoCount < 1) missing.push("photos");
  if (rule.require_technician_note && !data.technicianNote?.trim()) missing.push("technician_note");
  if (rule.require_customer_signature && !data.customerSignature?.trim()) missing.push("customer_signature");
  if (rule.require_equipment_reading && !data.equipmentReading?.trim()) missing.push("equipment_reading");
  if (rule.require_time_entry && (data.timeEntryMinutes === undefined || data.timeEntryMinutes === null)) {
    missing.push("time_entry");
  }
  if (rule.require_material_usage && !data.materialUsage?.trim()) missing.push("material_usage");
  if (rule.require_completion_reason && !data.completionReason?.trim()) missing.push("completion_reason");

  return { canComplete: missing.length === 0, missing };
}

const MISSING_LABELS: Record<MissingRequirement, string> = {
  checklist_complete: "Checklist must be fully completed",
  photos: "At least one photo is required",
  technician_note: "A technician note is required",
  customer_signature: "A customer signature is required",
  equipment_reading: "An equipment reading is required",
  time_entry: "A time entry is required",
  material_usage: "Material usage must be recorded",
  completion_reason: "A completion reason is required",
};

export function describeMissingRequirements(missing: MissingRequirement[]): string[] {
  return missing.map((m) => MISSING_LABELS[m]);
}

/**
 * Resolves the applicable rule for a service category from a tenant's
 * configured rows: exact service-category match, then the tenant's default
 * (service_category === null) row, then the hardcoded baseline.
 */
export function resolveCompletionRule(
  rules: CompletionRequirementRule[],
  serviceCategory: string
): CompletionRequirementRule | typeof DEFAULT_COMPLETION_RULE {
  const exact = rules.find((r) => r.service_category === serviceCategory);
  if (exact) return exact;
  const fallback = rules.find((r) => r.service_category === null || r.service_category === undefined);
  if (fallback) return fallback;
  return DEFAULT_COMPLETION_RULE;
}
