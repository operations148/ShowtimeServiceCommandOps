/**
 * Visit DB query layer — Supabase-backed, async.
 * Drop-in async replacement for src/lib/mock-data/visit-store.ts.
 *
 * visits.checklist is a JSONB column — Supabase returns it as a plain JS
 * array of ChecklistItemJson objects, which maps directly to ChecklistItem[].
 */

import { db } from "@/lib/db/client";
import { VisitStatus } from "@/types/visit";
import type { Visit, ChecklistItem } from "@/types/visit";
import type { CreateVisitInput, PatchVisitInput } from "@/lib/validation/visit";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nullToUndef<T>(v: T | null): T | undefined {
  return v === null ? undefined : v;
}

// ---------------------------------------------------------------------------
// Raw DB row shape
// ---------------------------------------------------------------------------

type VisitRow = {
  id: string;
  tenant_id: string;
  work_order_id: string;
  property_id: string;
  technician_id: string | null;
  status: string;
  scheduled_date: string;
  checklist: ChecklistItem[] | null;
  technician_notes: string | null;
  photo_urls: string[] | null;
  completed_at: string | null;
  estimate_flagged: boolean;
  completion_message: string | null;
  completed_by_name: string | null;
  created_at: string;
  updated_at: string;
};

function mapVisitRow(row: VisitRow): Visit {
  return {
    id:                 row.id,
    tenant_id:          row.tenant_id,
    work_order_id:      row.work_order_id,
    property_id:        row.property_id,
    technician_id:      nullToUndef(row.technician_id),
    status:             row.status as VisitStatus,
    scheduled_date:     row.scheduled_date,
    checklist:          row.checklist ?? [],
    technician_notes:   nullToUndef(row.technician_notes),
    photo_urls:         row.photo_urls ?? [],
    completed_at:       nullToUndef(row.completed_at),
    estimate_flagged:   row.estimate_flagged,
    completion_message: row.completion_message,
    completed_by_name:  row.completed_by_name,
    created_at:         row.created_at,
    updated_at:         row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Re-exported result types (same surface as mock store)
// ---------------------------------------------------------------------------

export type VisitUpdateResult =
  | { ok: true; data: Visit }
  | { ok: false; notFound: true };

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

export interface VisitListFilters {
  tenant_id?:       string;
  work_order_id?:   string;
  property_id?:     string;
  technician_id?:   string;
  status?:          VisitStatus;
  estimate_flagged?: boolean;
}

// ---------------------------------------------------------------------------
// listVisits
// ---------------------------------------------------------------------------

export async function listVisits(
  filters: VisitListFilters = {}
): Promise<Visit[]> {
  const tenantId = filters.tenant_id ?? "tenant-showtime";

  let query = db
    .from("visits")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("scheduled_date", { ascending: false });

  if (filters.work_order_id)   query = query.eq("work_order_id", filters.work_order_id);
  if (filters.property_id)     query = query.eq("property_id", filters.property_id);
  if (filters.technician_id)   query = query.eq("technician_id", filters.technician_id);
  if (filters.status)          query = query.eq("status", filters.status);
  if (filters.estimate_flagged !== undefined) {
    query = query.eq("estimate_flagged", filters.estimate_flagged);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[db] listVisits: ${error.message}`);

  return (data ?? []).map((row) => mapVisitRow(row as unknown as VisitRow));
}

// ---------------------------------------------------------------------------
// getVisitById
// ---------------------------------------------------------------------------

export async function getVisitById(
  id: string,
  tenantId = "tenant-showtime"
): Promise<Visit | undefined> {
  const { data, error } = await db
    .from("visits")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(`[db] getVisitById: ${error.message}`);
  if (!data) return undefined;
  return mapVisitRow(data as unknown as VisitRow);
}

// ---------------------------------------------------------------------------
// getOrCreateVisit — idempotent per (work_order_id, tenant_id)
// Called server-side when a technician opens the job detail page.
// ---------------------------------------------------------------------------

export async function getOrCreateVisit(
  workOrderId: string,
  propertyId: string,
  technicianId: string | undefined,
  initialChecklist: ChecklistItem[],
  tenantId = "tenant-showtime"
): Promise<Visit> {
  // Check for existing active visit for this work order
  const { data: existing, error: fetchError } = await db
    .from("visits")
    .select("*")
    .eq("work_order_id", workOrderId)
    .eq("tenant_id", tenantId)
    .not("status", "in", '("cancelled","skipped","completed")')
    .maybeSingle();

  if (fetchError) throw new Error(`[db] getOrCreateVisit fetch: ${fetchError.message}`);
  if (existing) return mapVisitRow(existing as unknown as VisitRow);

  const scheduledDate = new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .from("visits")
    .insert({
      tenant_id:        tenantId,
      work_order_id:    workOrderId,
      property_id:      propertyId,
      technician_id:    technicianId ?? null,
      status:           VisitStatus.IN_PROGRESS,
      scheduled_date:   scheduledDate,
      checklist:        initialChecklist as unknown as Record<string, unknown>[],
      photo_urls:       [],
      estimate_flagged: false,
    })
    .select("*")
    .single();

  if (error) throw new Error(`[db] getOrCreateVisit insert: ${error.message}`);
  return mapVisitRow(data as unknown as VisitRow);
}

// ---------------------------------------------------------------------------
// createVisit — called from POST /api/visits
// ---------------------------------------------------------------------------

export async function createVisit(
  input: CreateVisitInput,
  tenantId = "tenant-showtime"
): Promise<Visit> {
  const { data, error } = await db
    .from("visits")
    .insert({
      tenant_id:        tenantId,
      work_order_id:    input.work_order_id,
      property_id:      input.property_id,
      technician_id:    input.technician_id ?? null,
      status:           input.status,
      scheduled_date:   input.scheduled_date,
      checklist:        input.checklist as unknown as Record<string, unknown>[],
      technician_notes: input.technician_notes ?? null,
      photo_urls:       input.photo_urls,
      estimate_flagged: input.estimate_flagged,
      completed_at:     input.completed_at ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`[db] createVisit: ${error.message}`);
  return mapVisitRow(data as unknown as VisitRow);
}

// ---------------------------------------------------------------------------
// updateVisit
// ---------------------------------------------------------------------------

export async function updateVisit(
  id: string,
  patch: PatchVisitInput,
  tenantId = "tenant-showtime"
): Promise<VisitUpdateResult> {
  // Verify existence first
  const { data: existing, error: fetchError } = await db
    .from("visits")
    .select("id, estimate_flagged")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchError) throw new Error(`[db] updateVisit fetch: ${fetchError.message}`);
  if (!existing) return { ok: false, notFound: true };

  // Build update payload
  const updatePayload: Record<string, unknown> = {};
  if (patch.status             !== undefined) updatePayload.status             = patch.status;
  if (patch.technician_notes   !== undefined) updatePayload.technician_notes   = patch.technician_notes;
  if (patch.estimate_flagged   !== undefined) updatePayload.estimate_flagged   = patch.estimate_flagged;
  if (patch.completed_at       !== undefined) updatePayload.completed_at       = patch.completed_at;
  if (patch.completion_message !== undefined) updatePayload.completion_message = patch.completion_message;
  if (patch.completed_by_name  !== undefined) updatePayload.completed_by_name  = patch.completed_by_name;
  if (patch.checklist          !== undefined) {
    updatePayload.checklist = patch.checklist as unknown as Record<string, unknown>[];
  }

  const { data, error } = await db
    .from("visits")
    .update(updatePayload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) throw new Error(`[db] updateVisit update: ${error.message}`);
  return { ok: true, data: mapVisitRow(data as unknown as VisitRow) };
}
