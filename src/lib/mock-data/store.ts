import {
  WorkOrderStatus,
  EstimateHandoffStatus,
  Priority,
  WORK_ORDER_STATUS_TRANSITIONS,
} from "@/types/work-order";
import type { WorkOrderWithRelations, UpdateWorkOrderInput, CreateWorkOrderInput } from "@/types/work-order";
import type { NewWorkOrderInput } from "@/lib/validation/work-order";
import { MOCK_WORK_ORDERS } from "./work-orders";

// ---------------------------------------------------------------------------
// In-memory work order store — seeded from static mock data.
// Mutates are reflected immediately within the same process/warm instance.
// Resets on cold start — acceptable for the mock phase before DB is wired.
// ---------------------------------------------------------------------------

const store: WorkOrderWithRelations[] = structuredClone(
  MOCK_WORK_ORDERS as unknown as WorkOrderWithRelations[]
) as WorkOrderWithRelations[];

// Sequence starts after the last seeded WO number
let woSequence = MOCK_WORK_ORDERS.length + 1;

function nextWoNumber(): string {
  return `WO-${String(woSequence++).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface ListFilters {
  tenant_id?: string;
  status?: WorkOrderStatus;
  category?: string;
}

export function listWorkOrders(filters: ListFilters = {}): WorkOrderWithRelations[] {
  const tenantId = filters.tenant_id ?? "tenant-showtime";
  return store.filter((wo) => {
    if (wo.tenant_id !== tenantId) return false;
    if (filters.status && wo.status !== filters.status) return false;
    if (filters.category && wo.service_category !== filters.category) return false;
    return true;
  });
}

export function getWorkOrderById(id: string): WorkOrderWithRelations | undefined {
  return store.find((wo) => wo.id === id);
}

export function findByGhlOpportunityId(
  ghlOpportunityId: string,
  tenantId = "tenant-showtime"
): WorkOrderWithRelations | undefined {
  return store.find(
    (wo) => wo.ghl_opportunity_id === ghlOpportunityId && wo.tenant_id === tenantId
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export function createWorkOrder(
  input: NewWorkOrderInput,
  tenantId = "tenant-showtime"
): WorkOrderWithRelations {
  const now = new Date().toISOString();
  const newWo: WorkOrderWithRelations = {
    id: `wo-${Date.now()}`,
    wo_number: nextWoNumber(),
    tenant_id: tenantId,
    property_id: "prop-placeholder", // replaced in Phase 3
    title: input.title,
    description: input.description,
    status: WorkOrderStatus.NEW,
    priority: input.priority ?? Priority.NORMAL,
    service_category: input.service_category,
    assigned_technician_id: input.assigned_technician_id,
    scheduled_date: input.scheduled_date,
    estimate_handoff_status: EstimateHandoffStatus.NOT_NEEDED,
    created_at: now,
    updated_at: now,
    // Relation fields — populated from property module in Phase 3
    property_address: "To be linked in Phase 3",
    property_customer_name: "Unlinked",
  };
  store.push(newWo);
  return newWo;
}

// Full create — used by GHL webhook processing where property_id and GHL
// foreign keys are known. Accepts denormalized relation fields for list views.
export function createWorkOrderFull(
  input: CreateWorkOrderInput,
  propertyAddress: string,
  propertyCustomerName: string,
  assignedTechnicianName?: string,
): WorkOrderWithRelations {
  const now = new Date().toISOString();
  const newWo: WorkOrderWithRelations = {
    id:                     `wo-${Date.now()}`,
    wo_number:              nextWoNumber(),
    tenant_id:              input.tenant_id,
    property_id:            input.property_id,
    ghl_contact_id:         input.ghl_contact_id,
    ghl_opportunity_id:     input.ghl_opportunity_id,
    title:                  input.title,
    description:            input.description,
    status:                 input.status ?? WorkOrderStatus.NEW,
    priority:               input.priority,
    service_category:       input.service_category,
    assigned_technician_id: input.assigned_technician_id,
    scheduled_date:         input.scheduled_date,
    scheduled_time_start:   input.scheduled_time_start,
    scheduled_time_end:     input.scheduled_time_end,
    completed_at:           input.completed_at,
    estimate_handoff_status: input.estimate_handoff_status ?? EstimateHandoffStatus.NOT_NEEDED,
    created_at:             now,
    updated_at:             now,
    property_address:       propertyAddress,
    property_customer_name: propertyCustomerName,
    assigned_technician_name: assignedTechnicianName,
  };
  store.push(newWo);
  return newWo;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface StatusTransitionError {
  type: "invalid_transition";
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  allowed: WorkOrderStatus[];
}

export type UpdateResult =
  | { ok: true; data: WorkOrderWithRelations }
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; transitionError: StatusTransitionError };

export function updateWorkOrder(
  id: string,
  patch: UpdateWorkOrderInput
): UpdateResult {
  const idx = store.findIndex((wo) => wo.id === id);
  if (idx === -1) return { ok: false, notFound: true };

  const current = store[idx];

  // Validate status transition when status is being changed
  if (patch.status && patch.status !== current.status) {
    const allowed = WORK_ORDER_STATUS_TRANSITIONS[current.status];
    if (!allowed.includes(patch.status)) {
      return {
        ok: false,
        notFound: false,
        transitionError: {
          type: "invalid_transition",
          from: current.status,
          to: patch.status,
          allowed,
        },
      };
    }
    // Auto-set completed_at when transitioning to COMPLETED
    if (patch.status === WorkOrderStatus.COMPLETED && !patch.completed_at) {
      patch = { ...patch, completed_at: new Date().toISOString() };
    }
  }

  const updated: WorkOrderWithRelations = {
    ...current,
    ...patch,
    // Immutable fields — never overwritten by a patch
    id: current.id,
    tenant_id: current.tenant_id,
    wo_number: current.wo_number,
    created_at: current.created_at,
    updated_at: new Date().toISOString(),
  };

  store[idx] = updated;
  return { ok: true, data: updated };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteWorkOrder(id: string): boolean {
  const idx = store.findIndex((wo) => wo.id === id);
  if (idx === -1) return false;
  store.splice(idx, 1);
  return true;
}
