/**
 * Work-order DB query layer — Supabase-backed, async.
 * Drop-in async replacement for src/lib/mock-data/store.ts.
 * Exposes the same result types so API routes only need to add `await`.
 */

import { db } from "@/lib/db/client";
import {
  WorkOrderStatus,
  Priority,
  ServiceCategory,
  EstimateHandoffStatus,
  WORK_ORDER_STATUS_TRANSITIONS,
} from "@/types/work-order";
import type {
  WorkOrder,
  WorkOrderWithRelations,
  UpdateWorkOrderInput,
} from "@/types/work-order";
import type { NewWorkOrderInput } from "@/lib/validation/work-order";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function fmtWoNumber(n: number): string {
  return `WO-${String(n).padStart(4, "0")}`;
}

// PostgreSQL TIME columns return "HH:MM:SS" — truncate to "HH:MM"
function trimTime(t: string | null | undefined): string | undefined {
  if (!t) return undefined;
  return t.slice(0, 5);
}

function nullToUndef<T>(v: T | null): T | undefined {
  return v === null ? undefined : v;
}

// ---------------------------------------------------------------------------
// Supabase row shape returned by the joined select
// ---------------------------------------------------------------------------

type WoJoinedRow = {
  id: string;
  tenant_id: string;
  property_id: string | null;
  wo_number: number;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  service_category: string;
  assigned_technician_id: string | null;
  scheduled_date: string | null;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  completed_at: string | null;
  estimate_handoff_status: string;
  estimate_notes: string | null;
  ghl_sync_failed: boolean;
  recurring_schedule_id: string | null;
  ghl_trigger_stage: string | null;
  created_at: string;
  updated_at: string;
  // Embedded joins
  properties: { customer_name: string; address_line1: string; city: string; state: string; zip: string } | null;
  users: { name: string } | null;
};

function mapRow(row: WoJoinedRow): WorkOrderWithRelations {
  const p = row.properties;
  return {
    id:                     row.id,
    tenant_id:              row.tenant_id,
    property_id:            row.property_id ?? "",
    wo_number:              fmtWoNumber(row.wo_number),
    ghl_contact_id:         nullToUndef(row.ghl_contact_id),
    ghl_opportunity_id:     nullToUndef(row.ghl_opportunity_id),
    title:                  row.title,
    description:            nullToUndef(row.description),
    status:                 row.status as WorkOrderStatus,
    priority:               row.priority as Priority,
    service_category:       row.service_category as ServiceCategory,
    assigned_technician_id: nullToUndef(row.assigned_technician_id),
    scheduled_date:         nullToUndef(row.scheduled_date),
    scheduled_time_start:   trimTime(row.scheduled_time_start),
    scheduled_time_end:     trimTime(row.scheduled_time_end),
    completed_at:           nullToUndef(row.completed_at),
    estimate_handoff_status: row.estimate_handoff_status as EstimateHandoffStatus,
    estimate_notes:         nullToUndef(row.estimate_notes),
    ghl_sync_failed:        row.ghl_sync_failed || undefined,
    recurring_schedule_id:  nullToUndef(row.recurring_schedule_id),
    ghl_trigger_stage:      nullToUndef(row.ghl_trigger_stage),
    created_at:             row.created_at,
    updated_at:             row.updated_at,
    // Computed relation fields
    property_address:       p ? `${p.address_line1}, ${p.city}, ${p.state} ${p.zip}` : "",
    property_customer_name: p?.customer_name ?? "",
    assigned_technician_name: row.users?.name ?? undefined,
  };
}

// Joined select used by all read queries
const WO_SELECT =
  "*, properties(customer_name, address_line1, city, state, zip), users(name)";

// ---------------------------------------------------------------------------
// Re-exported result types (same surface as mock store so routes don't change)
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

// ---------------------------------------------------------------------------
// List filters — identical shape to mock store's ListFilters
// ---------------------------------------------------------------------------

export interface ListFilters {
  tenant_id?: string;
  status?: WorkOrderStatus;
  category?: string;
  technician_id?: string;
  property_id?: string;
  estimate?: boolean; // when true, filter where estimate_handoff_status != 'not_needed'
}

// ---------------------------------------------------------------------------
// listWorkOrders
// ---------------------------------------------------------------------------

export async function listWorkOrders(
  filters: ListFilters = {}
): Promise<WorkOrderWithRelations[]> {
  const tenantId = filters.tenant_id ?? "tenant-showtime";

  let query = db
    .from("work_orders")
    .select(WO_SELECT)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (filters.status)        query = query.eq("status", filters.status);
  if (filters.category)      query = query.eq("service_category", filters.category);
  if (filters.technician_id) query = query.eq("assigned_technician_id", filters.technician_id);
  if (filters.property_id)   query = query.eq("property_id", filters.property_id);
  if (filters.estimate)      query = query.neq("estimate_handoff_status", EstimateHandoffStatus.NOT_NEEDED);

  const { data, error } = await query;
  if (error) throw new Error(`[db] listWorkOrders: ${error.message}`);

  return (data as unknown as WoJoinedRow[]).map(mapRow);
}

// ---------------------------------------------------------------------------
// getWorkOrderById
// ---------------------------------------------------------------------------

export async function getWorkOrderById(
  id: string,
  tenantId?: string
): Promise<WorkOrderWithRelations | undefined> {
  let query = db.from("work_orders").select(WO_SELECT).eq("id", id);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(`[db] getWorkOrderById: ${error.message}`);
  if (!data) return undefined;
  return mapRow(data as unknown as WoJoinedRow);
}

// ---------------------------------------------------------------------------
// findByGhlOpportunityId — idempotency guard for webhook intake
// ---------------------------------------------------------------------------

export async function findByGhlOpportunityId(
  ghlOpportunityId: string,
  tenantId = "tenant-showtime"
): Promise<WorkOrderWithRelations | undefined> {
  const { data, error } = await db
    .from("work_orders")
    .select(WO_SELECT)
    .eq("ghl_opportunity_id", ghlOpportunityId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(`[db] findByGhlOpportunityId: ${error.message}`);
  if (!data) return undefined;
  return mapRow(data as unknown as WoJoinedRow);
}

// ---------------------------------------------------------------------------
// createWorkOrder — called from POST /api/work-orders (UI form)
// ---------------------------------------------------------------------------

export async function createWorkOrder(
  input: NewWorkOrderInput,
  tenantId = "tenant-showtime"
): Promise<WorkOrderWithRelations> {
  const { data, error } = await db
    .from("work_orders")
    .insert({
      tenant_id:        tenantId,
      property_id:      null,
      title:            input.title,
      description:      input.description,
      status:           WorkOrderStatus.NEW,
      priority:         input.priority ?? Priority.NORMAL,
      service_category: input.service_category,
      assigned_technician_id: input.assigned_technician_id ?? null,
      scheduled_date:   input.scheduled_date ?? null,
      estimate_handoff_status: EstimateHandoffStatus.NOT_NEEDED,
      ghl_sync_failed:  false,
    })
    .select(WO_SELECT)
    .single();

  if (error) throw new Error(`[db] createWorkOrder: ${error.message}`);
  return mapRow(data as unknown as WoJoinedRow);
}

// ---------------------------------------------------------------------------
// createWorkOrderFull — called from GHL webhook processing
// ---------------------------------------------------------------------------

export async function createWorkOrderFull(
  input: {
    tenant_id: string;
    property_id: string | null;
    ghl_contact_id?: string;
    ghl_opportunity_id?: string;
    ghl_trigger_stage?: string;
    title: string;
    description?: string;
    status?: WorkOrderStatus;
    priority: Priority;
    service_category: ServiceCategory;
    assigned_technician_id?: string;
    scheduled_date?: string;
    scheduled_time_start?: string;
    scheduled_time_end?: string;
    completed_at?: string;
    estimate_handoff_status?: EstimateHandoffStatus;
  },
  propertyAddress: string,
  propertyCustomerName: string,
  assignedTechnicianName?: string
): Promise<WorkOrderWithRelations> {
  const { data, error } = await db
    .from("work_orders")
    .insert({
      tenant_id:              input.tenant_id,
      property_id:            input.property_id,
      ghl_contact_id:         input.ghl_contact_id ?? null,
      ghl_opportunity_id:     input.ghl_opportunity_id ?? null,
      ghl_trigger_stage:      input.ghl_trigger_stage ?? null,
      title:                  input.title,
      description:            input.description ?? null,
      status:                 input.status ?? WorkOrderStatus.NEW,
      priority:               input.priority,
      service_category:       input.service_category,
      assigned_technician_id: input.assigned_technician_id ?? null,
      scheduled_date:         input.scheduled_date ?? null,
      scheduled_time_start:   input.scheduled_time_start ?? null,
      scheduled_time_end:     input.scheduled_time_end ?? null,
      completed_at:           input.completed_at ?? null,
      estimate_handoff_status: input.estimate_handoff_status ?? EstimateHandoffStatus.NOT_NEEDED,
      ghl_sync_failed:        false,
    })
    .select(WO_SELECT)
    .single();

  if (error) throw new Error(`[db] createWorkOrderFull: ${error.message}`);

  const wo = mapRow(data as unknown as WoJoinedRow);
  // If the joined data didn't resolve, override with the caller-supplied denormalized fields
  return {
    ...wo,
    property_address:       wo.property_address || propertyAddress,
    property_customer_name: wo.property_customer_name || propertyCustomerName,
    assigned_technician_name: wo.assigned_technician_name ?? assignedTechnicianName,
  };
}

// ---------------------------------------------------------------------------
// updateWorkOrder
// ---------------------------------------------------------------------------

export async function updateWorkOrder(
  id: string,
  patch: UpdateWorkOrderInput,
  tenantId?: string
): Promise<UpdateResult> {
  // Fetch current row to validate status transition
  const fetchQuery = db
    .from("work_orders")
    .select("status, tenant_id")
    .eq("id", id);

  if (tenantId) fetchQuery.eq("tenant_id", tenantId);

  const { data: current, error: fetchError } = await fetchQuery.maybeSingle();
  if (fetchError) throw new Error(`[db] updateWorkOrder fetch: ${fetchError.message}`);
  if (!current) return { ok: false, notFound: true };

  // Validate status transition
  let finalPatch = { ...patch };
  if (finalPatch.status && finalPatch.status !== (current.status as WorkOrderStatus)) {
    const currentStatus = current.status as WorkOrderStatus;
    const allowed = WORK_ORDER_STATUS_TRANSITIONS[currentStatus];
    if (!allowed.includes(finalPatch.status)) {
      return {
        ok: false,
        notFound: false,
        transitionError: {
          type:    "invalid_transition",
          from:    currentStatus,
          to:      finalPatch.status,
          allowed,
        },
      };
    }
    // Auto-set completed_at when transitioning TO COMPLETED
    if (finalPatch.status === WorkOrderStatus.COMPLETED && !finalPatch.completed_at) {
      finalPatch = { ...finalPatch, completed_at: new Date().toISOString() };
    }
  }

  // Build update payload — strip undefined values and immutable fields
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: _id, tenant_id: _tid, created_at: _cat, updated_at: _uat,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    wo_number: _wn, property_address: _pa, property_customer_name: _pcn,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    assigned_technician_name: _atn,
    ...rest
  } = finalPatch as WorkOrder & WorkOrderWithRelations;

  const updatePayload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) updatePayload[k] = v;
  }
  // Clear completed_at when leaving COMPLETED status
  if (
    (current.status as WorkOrderStatus) === WorkOrderStatus.COMPLETED &&
    finalPatch.status !== WorkOrderStatus.COMPLETED &&
    finalPatch.status !== undefined
  ) {
    updatePayload.completed_at = null;
  }

  let updateQuery = db.from("work_orders").update(updatePayload).eq("id", id);
  if (tenantId) updateQuery = updateQuery.eq("tenant_id", tenantId);

  const { data, error } = await updateQuery.select(WO_SELECT).single();

  if (error) throw new Error(`[db] updateWorkOrder update: ${error.message}`);
  return { ok: true, data: mapRow(data as unknown as WoJoinedRow) };
}

// ---------------------------------------------------------------------------
// findByGhlOpportunityIdAndStage — per-stage idempotency guard for webhook intake
// Allows two WOs for the same opportunity (e.g. Diagnosis Booked + Estimate Approved).
// ---------------------------------------------------------------------------

export async function findByGhlOpportunityIdAndStage(
  ghlOpportunityId: string,
  triggerStage: string,
  tenantId: string
): Promise<WorkOrderWithRelations | undefined> {
  const { data, error } = await db
    .from("work_orders")
    .select(WO_SELECT)
    .eq("ghl_opportunity_id", ghlOpportunityId)
    .eq("ghl_trigger_stage", triggerStage)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(`[db] findByGhlOpportunityIdAndStage: ${error.message}`);
  if (!data) return undefined;
  return mapRow(data as unknown as WoJoinedRow);
}

// ---------------------------------------------------------------------------
// findOpenByGhlOpportunityId — finds the most recently created non-terminal WO
// for a GHL opportunity. Used by status-update handlers (Diagnosis Completed,
// In Progress, Completed/Won) to find the right WO to patch.
// ---------------------------------------------------------------------------

export async function findOpenByGhlOpportunityId(
  ghlOpportunityId: string,
  tenantId: string
): Promise<WorkOrderWithRelations | undefined> {
  const { data, error } = await db
    .from("work_orders")
    .select(WO_SELECT)
    .eq("ghl_opportunity_id", ghlOpportunityId)
    .eq("tenant_id", tenantId)
    .not("status", "in", `(${WorkOrderStatus.CANCELLED},${WorkOrderStatus.COMPLETED})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`[db] findOpenByGhlOpportunityId: ${error.message}`);
  if (!data) return undefined;
  return mapRow(data as unknown as WoJoinedRow);
}

// ---------------------------------------------------------------------------
// findAnyByGhlOpportunityId — finds any WO for a GHL opportunity regardless
// of status. Used by flagEstimateFromGHL where the WO may already be completed.
// ---------------------------------------------------------------------------

export async function findAnyByGhlOpportunityId(
  ghlOpportunityId: string,
  tenantId: string
): Promise<WorkOrderWithRelations | undefined> {
  const { data, error } = await db
    .from("work_orders")
    .select(WO_SELECT)
    .eq("ghl_opportunity_id", ghlOpportunityId)
    .eq("ghl_trigger_stage", "Diagnosis Booked")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(`[db] findAnyByGhlOpportunityId: ${error.message}`);
  if (!data) return undefined;
  return mapRow(data as unknown as WoJoinedRow);
}

// ---------------------------------------------------------------------------
// deleteWorkOrder
// ---------------------------------------------------------------------------

export async function deleteWorkOrder(
  id: string,
  tenantId?: string
): Promise<boolean> {
  let query = db.from("work_orders").delete().eq("id", id);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { error } = await query;
  if (error) throw new Error(`[db] deleteWorkOrder: ${error.message}`);
  return true;
}
