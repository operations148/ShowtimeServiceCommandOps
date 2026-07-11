import { db } from "@/lib/db/client";
import { ScheduleFrequency } from "@/types/recurring-schedule";
import { ServiceCategory } from "@/types/work-order";
import type { RecurringScheduleWithRelations } from "@/types/recurring-schedule";
import type {
  CreateRecurringScheduleInput,
  UpdateRecurringScheduleInput,
} from "@/lib/validation/recurring-schedule";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nullToUndef<T>(v: T | null): T | undefined {
  return v === null ? undefined : v;
}

function trimTime(t: string | null | undefined): string | undefined {
  if (!t) return undefined;
  return t.slice(0, 5);
}

type ScheduleRow = {
  id: string;
  tenant_id: string;
  property_id: string;
  technician_id: string | null;
  frequency: string;
  day_of_week: number;
  time_start: string | null;
  time_end: string | null;
  service_category: string;
  is_active: boolean;
  starts_on: string;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
  users: { name: string } | null;
  properties: { address_line1: string; city: string; state: string; zip: string; customer_name: string } | null;
};

function mapRow(row: ScheduleRow): RecurringScheduleWithRelations {
  const p = row.properties;
  return {
    id:               row.id,
    tenant_id:        row.tenant_id,
    property_id:      row.property_id,
    technician_id:    nullToUndef(row.technician_id),
    frequency:        row.frequency as ScheduleFrequency,
    day_of_week:      row.day_of_week,
    time_start:       trimTime(row.time_start),
    time_end:         trimTime(row.time_end),
    service_category: row.service_category as ServiceCategory,
    is_active:        row.is_active,
    starts_on:        row.starts_on,
    ends_on:          nullToUndef(row.ends_on),
    created_at:       row.created_at,
    updated_at:       row.updated_at,
    technician_name:       row.users?.name,
    property_address:      p ? `${p.address_line1}, ${p.city}, ${p.state} ${p.zip}` : "",
    property_customer_name: p?.customer_name ?? "",
  };
}

const RS_SELECT =
  "*, users(name), properties(address_line1, city, state, zip, customer_name)";

// ---------------------------------------------------------------------------
// listRecurringSchedules
// ---------------------------------------------------------------------------

export interface ScheduleListFilters {
  tenant_id?:  string;
  property_id?: string;
  is_active?:  boolean;
}

export async function listRecurringSchedules(
  filters: ScheduleListFilters = {}
): Promise<RecurringScheduleWithRelations[]> {
  let query = db
    .from("recurring_schedules")
    .select(RS_SELECT)
    .order("created_at", { ascending: false });

  if (filters.tenant_id)  query = query.eq("tenant_id", filters.tenant_id);
  if (filters.property_id) query = query.eq("property_id", filters.property_id);
  if (filters.is_active !== undefined) query = query.eq("is_active", filters.is_active);

  const { data, error } = await query;
  if (error) throw new Error(`[db] listRecurringSchedules: ${error.message}`);
  return (data ?? []).map((row) => mapRow(row as unknown as ScheduleRow));
}

// ---------------------------------------------------------------------------
// getRecurringScheduleById
// ---------------------------------------------------------------------------

export async function getRecurringScheduleById(
  id: string,
  tenantId?: string
): Promise<RecurringScheduleWithRelations | undefined> {
  let query = db.from("recurring_schedules").select(RS_SELECT).eq("id", id);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`[db] getRecurringScheduleById: ${error.message}`);
  if (!data) return undefined;
  return mapRow(data as unknown as ScheduleRow);
}

// ---------------------------------------------------------------------------
// createRecurringSchedule
// ---------------------------------------------------------------------------

export async function createRecurringSchedule(
  input: CreateRecurringScheduleInput,
  tenantId: string
): Promise<RecurringScheduleWithRelations> {
  const { data, error } = await db
    .from("recurring_schedules")
    .insert({
      tenant_id:        tenantId,
      property_id:      input.property_id,
      technician_id:    input.technician_id ?? null,
      frequency:        input.frequency,
      day_of_week:      input.day_of_week,
      time_start:       input.time_start ?? null,
      time_end:         input.time_end ?? null,
      service_category: input.service_category,
      is_active:        input.is_active ?? true,
      starts_on:        input.starts_on,
      ends_on:          input.ends_on ?? null,
    })
    .select(RS_SELECT)
    .single();

  if (error) throw new Error(`[db] createRecurringSchedule: ${error.message}`);
  return mapRow(data as unknown as ScheduleRow);
}

// ---------------------------------------------------------------------------
// updateRecurringSchedule
// ---------------------------------------------------------------------------

export async function updateRecurringSchedule(
  id: string,
  patch: UpdateRecurringScheduleInput,
  tenantId?: string
): Promise<RecurringScheduleWithRelations | undefined> {
  const updatePayload: Record<string, unknown> = {};
  if (patch.technician_id  !== undefined) updatePayload.technician_id  = patch.technician_id ?? null;
  if (patch.frequency      !== undefined) updatePayload.frequency      = patch.frequency;
  if (patch.day_of_week    !== undefined) updatePayload.day_of_week    = patch.day_of_week;
  if (patch.time_start     !== undefined) updatePayload.time_start     = patch.time_start ?? null;
  if (patch.time_end       !== undefined) updatePayload.time_end       = patch.time_end ?? null;
  if (patch.service_category !== undefined) updatePayload.service_category = patch.service_category;
  if (patch.is_active      !== undefined) updatePayload.is_active      = patch.is_active;
  if (patch.starts_on      !== undefined) updatePayload.starts_on      = patch.starts_on;
  if (patch.ends_on        !== undefined) updatePayload.ends_on        = patch.ends_on ?? null;

  let updateQuery = db.from("recurring_schedules").update(updatePayload).eq("id", id);
  if (tenantId) updateQuery = updateQuery.eq("tenant_id", tenantId);

  const { data, error } = await updateQuery.select(RS_SELECT).maybeSingle();

  if (error) throw new Error(`[db] updateRecurringSchedule: ${error.message}`);
  if (!data) return undefined;
  return mapRow(data as unknown as ScheduleRow);
}

// ---------------------------------------------------------------------------
// deleteRecurringSchedule
//
// Soft delete (is_active = false) rather than a hard DELETE (security-audit
// M2/M3 pattern — the is_active column already existed but was previously
// ignored in favor of a real row delete). tenantId is required, not optional,
// so this function cannot run tenant-unscoped. Returns the updated row (or
// undefined if not found) instead of relying on a `count` that Supabase-js
// only populates when the query is built with `{ count: "exact" }` — the
// previous implementation always evaluated to `false` because of this.
// ---------------------------------------------------------------------------

export async function deleteRecurringSchedule(
  id: string,
  tenantId: string
): Promise<boolean> {
  const { data, error } = await db
    .from("recurring_schedules")
    .update({ is_active: false })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`[db] deleteRecurringSchedule: ${error.message}`);
  return data !== null;
}
