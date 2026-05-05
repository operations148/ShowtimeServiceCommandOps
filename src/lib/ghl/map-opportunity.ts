// Pure mapping functions: GHL opportunity payload → ServiceOps WorkOrder fields.
// No side effects, no I/O. All functions return safe defaults rather than throwing.

import { WorkOrderStatus, ServiceCategory, Priority } from "@/types/work-order";
import type { GHLOpportunityCustomField } from "@/types/ghl";

// ─── Status ───────────────────────────────────────────────────────────────────

// GHL's top-level status is too coarse; stage name is the primary signal.
// See ghl-opportunity-mapping.md § Status Mapping Table.
export function mapGhlStatus(
  ghlStatus: string | undefined,
  stageName: string | undefined
): WorkOrderStatus {
  if (ghlStatus === "won")                       return WorkOrderStatus.COMPLETED;
  if (ghlStatus === "lost" || ghlStatus === "abandoned") return WorkOrderStatus.CANCELLED;

  // open — use stage name as the primary discriminator
  if (stageName) {
    const s = stageName.toLowerCase();
    if (s.includes("in progress"))               return WorkOrderStatus.IN_PROGRESS;
    if (s.includes("scheduled") || s.includes("confirmed") || s.includes("assigned") || s.includes("job ready")) return WorkOrderStatus.ASSIGNED;
    if (s.includes("estimate"))                  return WorkOrderStatus.ESTIMATE_NEEDED;
    if (s.includes("follow"))                    return WorkOrderStatus.NEEDS_FOLLOW_UP;
    if (s.includes("new request") || s.includes("new lead")) return WorkOrderStatus.NEW;
  }

  return WorkOrderStatus.NEW;
}

// ─── Service category ─────────────────────────────────────────────────────────

// Ordered list: more specific keywords before less specific ones.
// See ghl-opportunity-mapping.md § Service Category Mapping Table.
const STAGE_KEYWORDS: Array<[string, ServiceCategory]> = [
  ["weekly",              ServiceCategory.WEEKLY_POOL_MAINTENANCE],
  ["filter",              ServiceCategory.FILTER_CLEANING],
  ["heater",              ServiceCategory.HEATER_SERVICE],
  ["equipment install",   ServiceCategory.EQUIPMENT_INSTALLATION],
  ["equipment",           ServiceCategory.EQUIPMENT_INSTALLATION],
  ["inspect",             ServiceCategory.POOL_INSPECTION_DIAGNOSTIC],
  ["diagnostic",          ServiceCategory.POOL_INSPECTION_DIAGNOSTIC],
  ["emergency",           ServiceCategory.EMERGENCY_SERVICE],
  ["remodel",             ServiceCategory.POOL_REMODEL],
  ["construction",        ServiceCategory.NEW_CONSTRUCTION],
  ["repair",              ServiceCategory.POOL_REPAIR],
];

export function mapServiceCategoryFromStageName(stageName: string | undefined): ServiceCategory {
  if (!stageName) return ServiceCategory.OTHER;
  const s = stageName.toLowerCase();
  for (const [keyword, category] of STAGE_KEYWORDS) {
    if (s.includes(keyword)) return category;
  }
  return ServiceCategory.OTHER;
}

// If the opportunity has a custom field with an explicit ServiceCategory value,
// that takes precedence over the stage-name heuristic.
export function mapServiceCategoryFromCustomField(raw: string | undefined): ServiceCategory | undefined {
  if (!raw) return undefined;
  const normalized = raw.toLowerCase().trim();
  const match = (Object.values(ServiceCategory) as string[]).find((v) => v === normalized);
  return match as ServiceCategory | undefined;
}

// ─── Custom field extraction ──────────────────────────────────────────────────

// Opportunity custom fields use "fieldValue", not "value" (unlike contact fields).
// See ghl-opportunity-mapping.md § Custom Field Configuration.
export function extractOppCustomField(
  fields: GHLOpportunityCustomField[] | undefined,
  envKey: string
): string | undefined {
  const fieldId = process.env[envKey];
  if (!fieldId || !fields) return undefined;
  return fields.find((f) => f.id === fieldId)?.fieldValue ?? undefined;
}

// ─── Date / time validation ───────────────────────────────────────────────────

// Returns the value only if it matches YYYY-MM-DD exactly; undefined otherwise.
export function parseGhlDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : undefined;
}

// Returns the value only if it matches HH:MM exactly; undefined otherwise.
export function parseGhlTime(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return /^\d{2}:\d{2}$/.test(raw.trim()) ? raw.trim() : undefined;
}

// ─── Priority ─────────────────────────────────────────────────────────────────

export function mapGhlPriority(raw: string | undefined): Priority {
  if (!raw) return Priority.NORMAL;
  switch (raw.toLowerCase().trim()) {
    case "low":    return Priority.LOW;
    case "high":   return Priority.HIGH;
    case "urgent": return Priority.URGENT;
    default:       return Priority.NORMAL;
  }
}

// ─── Stage gate ───────────────────────────────────────────────────────────────

// Returns true only when the pipeline stage indicates the job is ready to be
// scheduled or is already in progress. Lead/quote stages return false.
// Configurable via GHL_JOB_READY_STAGES env var (comma-separated substrings).
const DEFAULT_JOB_READY_SUBSTRINGS = [
  "scheduled",
  "confirmed",
  "in progress",
  "job ready",
  "assigned",
];

export function isJobReadyStage(stageName: string | undefined, ghlStatus: string | undefined): boolean {
  // "won" means job was already completed in GHL — still create/update the WorkOrder.
  if (ghlStatus === "won") return true;
  // Terminal non-job statuses — do not create.
  if (ghlStatus === "lost" || ghlStatus === "abandoned") return false;

  if (!stageName) return false;
  const s = stageName.toLowerCase();

  const configuredRaw = process.env.GHL_JOB_READY_STAGES;
  const substrings = configuredRaw
    ? configuredRaw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_JOB_READY_SUBSTRINGS;

  return substrings.some((sub) => s.includes(sub));
}
