/**
 * Property DB query layer — Supabase-backed, async.
 * Drop-in async replacement for src/lib/mock-data/property-store.ts.
 *
 * PropertyWithRelations computed fields (active_work_order_count,
 * last_service_date, last_service_technician_name) are computed in two
 * queries: one for the properties, one for aggregated work-order stats.
 */

import { db } from "@/lib/db/client";
import type { Property, PropertyWithRelations, PoolEquipment } from "@/types/property";
import type { CreatePropertyInput, PatchPropertyInput } from "@/lib/validation/property";
import { WorkOrderStatus } from "@/types/work-order";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nullToUndef<T>(v: T | null): T | undefined {
  return v === null ? undefined : v;
}

// Non-terminal statuses — used to compute active_work_order_count
const NON_TERMINAL_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.NEW,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ESTIMATE_NEEDED,
  WorkOrderStatus.NEEDS_FOLLOW_UP,
];

// ---------------------------------------------------------------------------
// Raw DB row shape
// ---------------------------------------------------------------------------

type PropertyRow = {
  id: string;
  tenant_id: string;
  ghl_contact_id: string | null;
  customer_name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  gate_code: string | null;
  access_notes: string | null;
  service_notes: string | null;
  pool_equipment: PoolEquipment | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function mapPropertyRow(row: PropertyRow): Property {
  return {
    id:             row.id,
    tenant_id:      row.tenant_id,
    ghl_contact_id: nullToUndef(row.ghl_contact_id),
    customer_name:  row.customer_name,
    address_line1:  row.address_line1,
    address_line2:  nullToUndef(row.address_line2),
    city:           row.city,
    state:          row.state,
    zip:            row.zip,
    gate_code:      nullToUndef(row.gate_code),
    access_notes:   nullToUndef(row.access_notes),
    service_notes:  nullToUndef(row.service_notes),
    pool_equipment: nullToUndef(row.pool_equipment),
    is_active:      row.is_active,
    created_at:     row.created_at,
    updated_at:     row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Compute work-order aggregates for a set of properties in one query
// ---------------------------------------------------------------------------

type WoAggRow = {
  property_id: string;
  status: string;
  scheduled_date: string | null;
  assigned_technician_id: string | null;
  users: { name: string } | null;
};

type AggMap = Map<string, {
  activeCount: number;
  lastServiceDate?: string;
  lastServiceTechName?: string;
}>;

async function buildWoAggregates(propIds: string[], tenantId: string): Promise<AggMap> {
  if (propIds.length === 0) return new Map();

  const { data, error } = await db
    .from("work_orders")
    .select("property_id, status, scheduled_date, users(name)")
    .in("property_id", propIds)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(`[db] buildWoAggregates: ${error.message}`);

  const rows = (data ?? []) as unknown as WoAggRow[];
  const map: AggMap = new Map();

  for (const row of rows) {
    const curr = map.get(row.property_id) ?? { activeCount: 0 };

    if (NON_TERMINAL_STATUSES.includes(row.status as WorkOrderStatus)) {
      curr.activeCount += 1;
    }

    if (
      row.status === WorkOrderStatus.COMPLETED &&
      row.scheduled_date &&
      (!curr.lastServiceDate || row.scheduled_date > curr.lastServiceDate)
    ) {
      curr.lastServiceDate = row.scheduled_date;
      curr.lastServiceTechName = row.users?.name ?? undefined;
    }

    map.set(row.property_id, curr);
  }

  return map;
}

function applyAgg(prop: Property, agg: AggMap): PropertyWithRelations {
  const stats = agg.get(prop.id) ?? { activeCount: 0 };
  return {
    ...prop,
    active_work_order_count:      stats.activeCount,
    last_service_date:            stats.lastServiceDate,
    last_service_technician_name: stats.lastServiceTechName,
  };
}

// ---------------------------------------------------------------------------
// Re-exported result types (same surface as mock store)
// ---------------------------------------------------------------------------

export type PropertyUpdateResult =
  | { ok: true; data: PropertyWithRelations }
  | { ok: false; notFound: true };

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

export interface PropertyListFilters {
  tenant_id?: string;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// listProperties
// ---------------------------------------------------------------------------

export async function listProperties(
  filters: PropertyListFilters = {}
): Promise<PropertyWithRelations[]> {
  const tenantId = filters.tenant_id ?? "tenant-showtime";

  let query = db
    .from("properties")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("customer_name", { ascending: true });

  if (filters.is_active !== undefined) {
    query = query.eq("is_active", filters.is_active);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[db] listProperties: ${error.message}`);

  const props = (data ?? []) as unknown as PropertyRow[];
  const propIds = props.map((p) => p.id);
  const agg = await buildWoAggregates(propIds, tenantId);

  return props.map((row) => applyAgg(mapPropertyRow(row), agg));
}

// ---------------------------------------------------------------------------
// getPropertyById
// ---------------------------------------------------------------------------

export async function getPropertyById(
  id: string,
  tenantId = "tenant-showtime"
): Promise<PropertyWithRelations | undefined> {
  const [propResult, aggMap] = await Promise.all([
    db.from("properties").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle(),
    buildWoAggregates([id], tenantId),
  ]);

  if (propResult.error) throw new Error(`[db] getPropertyById: ${propResult.error.message}`);
  if (!propResult.data) return undefined;

  return applyAgg(mapPropertyRow(propResult.data as unknown as PropertyRow), aggMap);
}

// ---------------------------------------------------------------------------
// findPropertyByGhlContactId — used by GHL webhook processing
// ---------------------------------------------------------------------------

export async function findPropertyByGhlContactId(
  ghlContactId: string,
  tenantId = "tenant-showtime"
): Promise<PropertyWithRelations | undefined> {
  const { data, error } = await db
    .from("properties")
    .select("*")
    .eq("ghl_contact_id", ghlContactId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(`[db] findPropertyByGhlContactId: ${error.message}`);
  if (!data) return undefined;

  const row = data as unknown as PropertyRow;
  const agg = await buildWoAggregates([row.id], tenantId);
  return applyAgg(mapPropertyRow(row), agg);
}

// ---------------------------------------------------------------------------
// createProperty
// ---------------------------------------------------------------------------

export async function createProperty(
  input: CreatePropertyInput,
  tenantId = "tenant-showtime"
): Promise<PropertyWithRelations> {
  const { data, error } = await db
    .from("properties")
    .insert({
      tenant_id:      tenantId,
      customer_name:  input.customer_name,
      address_line1:  input.address_line1,
      address_line2:  input.address_line2 ?? null,
      city:           input.city,
      state:          input.state,
      zip:            input.zip,
      ghl_contact_id: input.ghl_contact_id ?? null,
      gate_code:      input.gate_code ?? null,
      access_notes:   input.access_notes ?? null,
      service_notes:  input.service_notes ?? null,
      pool_equipment: (input.pool_equipment as unknown as Record<string, unknown>) ?? null,
      is_active:      input.is_active,
    })
    .select("*")
    .single();

  if (error) throw new Error(`[db] createProperty: ${error.message}`);

  return applyAgg(mapPropertyRow(data as unknown as PropertyRow), new Map());
}

// ---------------------------------------------------------------------------
// updateProperty
// ---------------------------------------------------------------------------

export async function updateProperty(
  id: string,
  patch: PatchPropertyInput,
  tenantId = "tenant-showtime"
): Promise<PropertyUpdateResult> {
  // Verify existence first (also checks tenant isolation)
  const { data: existing, error: fetchError } = await db
    .from("properties")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchError) throw new Error(`[db] updateProperty fetch: ${fetchError.message}`);
  if (!existing) return { ok: false, notFound: true };

  // Build update payload — strip undefined values
  const updatePayload: Record<string, unknown> = {};
  const allowed: Array<keyof PatchPropertyInput> = [
    "customer_name", "address_line1", "address_line2", "city", "state", "zip",
    "ghl_contact_id", "gate_code", "access_notes", "service_notes",
    "pool_equipment", "is_active",
  ];
  for (const key of allowed) {
    const val = patch[key];
    if (val !== undefined) {
      updatePayload[key] = val === null ? null : val;
    }
  }

  // Phase 12: if any address component changed, invalidate the geocode cache so
  // the map re-geocodes against the new address (lazily, on next view) rather
  // than pinning the old location.
  const addressFields: Array<keyof PatchPropertyInput> = ["address_line1", "address_line2", "city", "state", "zip"];
  if (addressFields.some((f) => patch[f] !== undefined)) {
    updatePayload.latitude = null;
    updatePayload.longitude = null;
    updatePayload.geocoded_at = null;
  }

  const { data, error } = await db
    .from("properties")
    .update(updatePayload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) throw new Error(`[db] updateProperty update: ${error.message}`);

  const agg = await buildWoAggregates([id], tenantId);
  return { ok: true, data: applyAgg(mapPropertyRow(data as unknown as PropertyRow), agg) };
}
