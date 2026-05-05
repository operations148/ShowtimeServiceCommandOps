import type { Visit, ChecklistItem } from "@/types/visit";
import { VisitStatus } from "@/types/visit";
import type { CreateVisitInput, PatchVisitInput } from "@/lib/validation/visit";

// ---------------------------------------------------------------------------
// In-memory visit store — resets on cold start.
// Anchored to globalThis so server components and API routes share the same
// array across Next.js module re-instantiations in dev mode.
// ---------------------------------------------------------------------------

type VisitGlobal = {
  __visitStore: Visit[];
  __visitIdSeq: number;
};

const g = globalThis as typeof globalThis & VisitGlobal;
if (!g.__visitStore) g.__visitStore = [];
if (!g.__visitIdSeq)  g.__visitIdSeq = 1;

const store   = g.__visitStore;

function nextId(): string {
  return `visit-${String(g.__visitIdSeq++).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface VisitListFilters {
  tenant_id?:       string;
  work_order_id?:   string;
  property_id?:     string;
  technician_id?:   string;
  status?:          VisitStatus;
  estimate_flagged?: boolean;
}

export function listVisits(filters: VisitListFilters = {}): Visit[] {
  const tenantId = filters.tenant_id ?? "tenant-showtime";
  return store.filter((v) => {
    if (v.tenant_id !== tenantId) return false;
    if (filters.work_order_id   !== undefined && v.work_order_id !== filters.work_order_id)     return false;
    if (filters.property_id     !== undefined && v.property_id   !== filters.property_id)       return false;
    if (filters.technician_id   !== undefined && v.technician_id !== filters.technician_id)     return false;
    if (filters.status          !== undefined && v.status        !== filters.status)            return false;
    if (filters.estimate_flagged !== undefined && v.estimate_flagged !== filters.estimate_flagged) return false;
    return true;
  });
}

export function getVisitById(id: string, tenantId = "tenant-showtime"): Visit | undefined {
  return store.find((v) => v.id === id && v.tenant_id === tenantId);
}

// ---------------------------------------------------------------------------
// Get or create — idempotent per work_order_id.
// Called server-side when a tech opens the job detail page.
// ---------------------------------------------------------------------------

export function getOrCreateVisit(
  workOrderId: string,
  propertyId: string,
  technicianId: string | undefined,
  initialChecklist: ChecklistItem[],
  tenantId = "tenant-showtime"
): Visit {
  const existing = store.find(
    (v) => v.work_order_id === workOrderId && v.tenant_id === tenantId
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const visit: Visit = {
    id:               nextId(),
    tenant_id:        tenantId,
    work_order_id:    workOrderId,
    property_id:      propertyId,
    technician_id:    technicianId,
    status:           VisitStatus.IN_PROGRESS,
    scheduled_date:   now.slice(0, 10),
    checklist:        initialChecklist,
    photo_urls:       [],
    estimate_flagged: false,
    created_at:       now,
    updated_at:       now,
  };
  store.push(visit);
  return visit;
}

// ---------------------------------------------------------------------------
// Create (called from POST /api/visits)
// ---------------------------------------------------------------------------

export function createVisit(input: CreateVisitInput, tenantId = "tenant-showtime"): Visit {
  const now = new Date().toISOString();
  const visit: Visit = {
    id:               nextId(),
    tenant_id:        tenantId,
    work_order_id:    input.work_order_id,
    property_id:      input.property_id,
    technician_id:    input.technician_id,
    status:           input.status,
    scheduled_date:   input.scheduled_date,
    checklist:        input.checklist,
    technician_notes: input.technician_notes,
    photo_urls:       input.photo_urls,
    estimate_flagged: input.estimate_flagged,
    completed_at:     input.completed_at,
    created_at:       now,
    updated_at:       now,
  };
  store.push(visit);
  return visit;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export type VisitUpdateResult =
  | { ok: true; data: Visit }
  | { ok: false; notFound: true };

export function updateVisit(id: string, patch: PatchVisitInput, tenantId = "tenant-showtime"): VisitUpdateResult {
  const idx = store.findIndex((v) => v.id === id && v.tenant_id === tenantId);
  if (idx === -1) return { ok: false, notFound: true };

  const current = store[idx];
  const updated: Visit = {
    ...current,
    ...patch,
    // Immutable fields
    id:            current.id,
    tenant_id:     current.tenant_id,
    work_order_id: current.work_order_id,
    property_id:   current.property_id,
    created_at:    current.created_at,
    updated_at:    new Date().toISOString(),
  };
  store[idx] = updated;
  return { ok: true, data: updated };
}
