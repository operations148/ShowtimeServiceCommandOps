import type { PropertyWithRelations } from "@/types/property";
import type { CreatePropertyInput, PatchPropertyInput } from "@/lib/validation/property";
import { MOCK_PROPERTIES } from "./properties";

// ---------------------------------------------------------------------------
// In-memory property store — seeded from static mock data.
// Mutations persist within the same warm process instance.
// Resets on cold start — acceptable before a real DB is wired.
// ---------------------------------------------------------------------------

const store: PropertyWithRelations[] = structuredClone(
  MOCK_PROPERTIES as PropertyWithRelations[]
);

let idSequence = MOCK_PROPERTIES.length + 1;

function nextPropId(): string {
  return `prop-${String(idSequence++).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface PropertyListFilters {
  tenant_id?: string;
  is_active?: boolean;
}

export function listProperties(filters: PropertyListFilters = {}): PropertyWithRelations[] {
  const tenantId = filters.tenant_id ?? "tenant-showtime";
  return store.filter((p) => {
    if (p.tenant_id !== tenantId) return false;
    if (filters.is_active !== undefined && p.is_active !== filters.is_active) return false;
    return true;
  });
}

export function getPropertyById(
  id: string,
  tenantId = "tenant-showtime"
): PropertyWithRelations | undefined {
  return store.find((p) => p.id === id && p.tenant_id === tenantId);
}

export function findPropertyByGhlContactId(
  ghlContactId: string,
  tenantId = "tenant-showtime"
): PropertyWithRelations | undefined {
  return store.find(
    (p) => p.ghl_contact_id === ghlContactId && p.tenant_id === tenantId
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export function createProperty(
  input: CreatePropertyInput,
  tenantId = "tenant-showtime"
): PropertyWithRelations {
  const now = new Date().toISOString();
  const prop: PropertyWithRelations = {
    id:              nextPropId(),
    tenant_id:       tenantId,
    customer_name:   input.customer_name,
    address_line1:   input.address_line1,
    address_line2:   input.address_line2,
    city:            input.city,
    state:           input.state,
    zip:             input.zip,
    ghl_contact_id:  input.ghl_contact_id,
    gate_code:       input.gate_code,
    access_notes:    input.access_notes,
    service_notes:   input.service_notes,
    pool_equipment:  input.pool_equipment,
    is_active:       input.is_active,
    created_at:      now,
    updated_at:      now,
    // Relation fields — computed from work orders; start at zero for new properties
    active_work_order_count: 0,
  };
  store.push(prop);
  return prop;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export type PropertyUpdateResult =
  | { ok: true; data: PropertyWithRelations }
  | { ok: false; notFound: true };

export function updateProperty(
  id: string,
  patch: PatchPropertyInput,
  tenantId = "tenant-showtime"
): PropertyUpdateResult {
  const idx = store.findIndex((p) => p.id === id && p.tenant_id === tenantId);
  if (idx === -1) return { ok: false, notFound: true };

  const current = store[idx];
  const updated: PropertyWithRelations = {
    ...current,
    ...patch,
    // Immutable fields — never overwritten by a patch
    id:         current.id,
    tenant_id:  current.tenant_id,
    created_at: current.created_at,
    updated_at: new Date().toISOString(),
    // Preserve computed relation fields (owned by WO module, not property patch)
    active_work_order_count:      current.active_work_order_count,
    last_service_date:            current.last_service_date,
    last_service_technician_name: current.last_service_technician_name,
  };

  store[idx] = updated;
  return { ok: true, data: updated };
}
