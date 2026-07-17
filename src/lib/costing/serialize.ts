/**
 * Cost redaction for job-costing reads (Phase 9, ADR-0016 §3).
 *
 * A technician may LOG time/mileage/expenses but must never SEE their burdened
 * rate, an entry's cost, or the job's margin. This is enforced here, server-
 * side, by building a NEW allowlist object rather than deleting keys off the
 * row — the money fields are structurally absent from the returned shape, so
 * they cannot leak through a spread, a log line, or a future field addition.
 *
 * Same discipline as the pricebook's cost-visibility rail and PublicEstimate.
 */

import type {
  TimeEntry, MileageEntry, JobExpense,
  TechTimeEntry, TechMileageEntry, TechJobExpense,
} from "@/types/costing";

export function toTechTimeEntry(e: TimeEntry): TechTimeEntry {
  return {
    id: e.id,
    work_order_id: e.work_order_id,
    visit_id: e.visit_id ?? null,
    technician_id: e.technician_id,
    minutes: e.minutes,
    started_at: e.started_at ?? null,
    ended_at: e.ended_at ?? null,
    notes: e.notes ?? null,
    created_at: e.created_at,
  };
}

export function toTechMileageEntry(e: MileageEntry): TechMileageEntry {
  return {
    id: e.id,
    work_order_id: e.work_order_id,
    visit_id: e.visit_id ?? null,
    technician_id: e.technician_id,
    miles: e.miles,
    notes: e.notes ?? null,
    created_at: e.created_at,
  };
}

export function toTechJobExpense(e: JobExpense): TechJobExpense {
  return {
    id: e.id,
    work_order_id: e.work_order_id,
    visit_id: e.visit_id ?? null,
    category: e.category,
    description: e.description,
    vendor: e.vendor ?? null,
    receipt_path: e.receipt_path ?? null,
    incurred_on: e.incurred_on,
    created_at: e.created_at,
  };
}

/**
 * Pick the right shape for the caller. Pass the caller's canViewJobCosting.
 * Callers should route EVERY costing read through these so the redaction can't
 * be forgotten at one call site.
 */
export function serializeTimeEntries(entries: TimeEntry[], canViewCosts: boolean): TimeEntry[] | TechTimeEntry[] {
  return canViewCosts ? entries : entries.map(toTechTimeEntry);
}

export function serializeMileageEntries(entries: MileageEntry[], canViewCosts: boolean): MileageEntry[] | TechMileageEntry[] {
  return canViewCosts ? entries : entries.map(toTechMileageEntry);
}

export function serializeJobExpenses(entries: JobExpense[], canViewCosts: boolean): JobExpense[] | TechJobExpense[] {
  return canViewCosts ? entries : entries.map(toTechJobExpense);
}
