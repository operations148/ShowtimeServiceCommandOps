import { db } from "@/lib/db/client";
import { VisitStatus, type VisitWithSchedule, type VisitAssignmentSummary } from "@/types/visit";
import type { ScheduleEvent, ScheduleEventType } from "@/types/scheduling";
import type { AssignVisitInput, RescheduleVisitInput } from "@/lib/validation/scheduling";
import { wallTimeToUtc } from "@/lib/scheduling/timezone";

// ─── Row shape for the joined schedule feed ───────────────────────────────────

type FeedRow = {
  id: string;
  tenant_id: string;
  work_order_id: string;
  property_id: string;
  technician_id: string | null;
  status: string;
  scheduled_date: string;
  planned_start_at: string | null;
  planned_end_at: string | null;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
  estimated_duration_minutes: number | null;
  travel_buffer_minutes: number | null;
  all_day: boolean | null;
  route_order: number | null;
  reschedule_reason: string | null;
  version: number | null;
  ghl_appointment_id: string | null;
  ghl_sync_state: string | null;
  estimate_flagged: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  checklist: unknown;
  photo_urls: string[] | null;
  technician_notes: string | null;
  completion_message: string | null;
  completed_by_name: string | null;
  properties: { customer_name: string | null; address_line1: string | null; city: string | null } | null;
  work_orders: { wo_number: number | null; title: string | null } | null;
};

function mapFeedRow(row: FeedRow, assignments: VisitAssignmentSummary[]): VisitWithSchedule {
  const addr = row.properties
    ? [row.properties.address_line1, row.properties.city].filter(Boolean).join(", ")
    : null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    work_order_id: row.work_order_id,
    property_id: row.property_id,
    technician_id: row.technician_id ?? undefined,
    status: row.status as VisitStatus,
    scheduled_date: row.scheduled_date,
    checklist: Array.isArray(row.checklist) ? (row.checklist as VisitWithSchedule["checklist"]) : [],
    technician_notes: row.technician_notes ?? undefined,
    photo_urls: row.photo_urls ?? [],
    completed_at: row.completed_at ?? undefined,
    estimate_flagged: row.estimate_flagged,
    completion_message: row.completion_message,
    completed_by_name: row.completed_by_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
    planned_start_at: row.planned_start_at,
    planned_end_at: row.planned_end_at,
    arrival_window_start: row.arrival_window_start,
    arrival_window_end: row.arrival_window_end,
    estimated_duration_minutes: row.estimated_duration_minutes,
    travel_buffer_minutes: row.travel_buffer_minutes ?? 0,
    all_day: row.all_day ?? false,
    route_order: row.route_order,
    reschedule_reason: row.reschedule_reason,
    version: row.version ?? 1,
    ghl_appointment_id: row.ghl_appointment_id,
    ghl_sync_state: (row.ghl_sync_state as VisitWithSchedule["ghl_sync_state"]) ?? "none",
    property_customer_name: row.properties?.customer_name ?? null,
    property_address: addr,
    wo_number: row.work_orders?.wo_number ?? null,
    work_order_title: row.work_orders?.title ?? null,
    assignments,
  };
}

const FEED_SELECT =
  "*, properties:property_id(customer_name,address_line1,city), work_orders:work_order_id(wo_number,title)";

// ─── Schedule feed (calendar range) ───────────────────────────────────────────

export interface ScheduleFeedOptions {
  from: string; // tenant-local YYYY-MM-DD (inclusive)
  to: string; // inclusive
  technicianId?: string;
  scope?: "all" | "unassigned" | "overdue";
  todayLocal: string; // tenant-local today, for the "overdue" scope
  /** When set (technician role), restrict to visits this user leads or assists on. */
  restrictToTechnicianUserId?: string;
}

export async function getScheduleFeed(tenantId: string, opts: ScheduleFeedOptions): Promise<VisitWithSchedule[]> {
  let query = db
    .from("visits")
    .select(FEED_SELECT)
    .eq("tenant_id", tenantId)
    .gte("scheduled_date", opts.from)
    .lte("scheduled_date", opts.to)
    .order("scheduled_date", { ascending: true })
    .order("route_order", { ascending: true, nullsFirst: false });

  if (opts.technicianId) query = query.eq("technician_id", opts.technicianId);
  if (opts.scope === "unassigned") query = query.is("technician_id", null);
  if (opts.scope === "overdue") {
    query = query
      .lt("scheduled_date", opts.todayLocal)
      .in("status", [VisitStatus.SCHEDULED, VisitStatus.IN_PROGRESS]);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[db] getScheduleFeed: ${error.message}`);
  let rows = (data ?? []) as unknown as FeedRow[];

  // Technician scoping: keep visits they lead OR are assigned to.
  let assignmentsByVisit = new Map<string, VisitAssignmentSummary[]>();
  const visitIds = rows.map((r) => r.id);
  if (visitIds.length > 0) {
    assignmentsByVisit = await getAssignmentsForVisits(tenantId, visitIds);
  }

  if (opts.restrictToTechnicianUserId) {
    const uid = opts.restrictToTechnicianUserId;
    rows = rows.filter(
      (r) => r.technician_id === uid || (assignmentsByVisit.get(r.id) ?? []).some((a) => a.technician_id === uid)
    );
  }

  return rows.map((r) => mapFeedRow(r, assignmentsByVisit.get(r.id) ?? []));
}

async function getAssignmentsForVisits(tenantId: string, visitIds: string[]): Promise<Map<string, VisitAssignmentSummary[]>> {
  const { data, error } = await db
    .from("visit_assignments")
    .select("visit_id, technician_id, role, users:technician_id(name)")
    .eq("tenant_id", tenantId)
    .in("visit_id", visitIds);
  if (error) throw new Error(`[db] getAssignmentsForVisits: ${error.message}`);

  const map = new Map<string, VisitAssignmentSummary[]>();
  type AssignmentJoin = { visit_id: string; technician_id: string; role: string; users: { name: string | null } | { name: string | null }[] | null };
  for (const row of (data ?? []) as unknown as AssignmentJoin[]) {
    // Supabase may return the FK join as an object or a single-element array.
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    const list = map.get(row.visit_id) ?? [];
    list.push({ technician_id: row.technician_id, role: row.role as "lead" | "assistant", name: user?.name ?? null });
    map.set(row.visit_id, list);
  }
  return map;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export type ScheduleWriteResult =
  | { ok: true; data: VisitWithSchedule }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true; currentVersion: number }
  | { ok: false; invalidTechnician: string[] };

// ─── Assignment (multi-technician) ────────────────────────────────────────────

export async function assignVisit(
  visitId: string,
  input: AssignVisitInput,
  tenantId: string,
  actorUserId: string
): Promise<ScheduleWriteResult> {
  const current = await getVisitRaw(visitId, tenantId);
  if (!current) return { ok: false, notFound: true };
  if ((current.version ?? 1) !== input.version) {
    return { ok: false, conflict: true, currentVersion: current.version ?? 1 };
  }

  // Validate all referenced technicians belong to the tenant and are technicians.
  const techIds = [...new Set([input.lead_technician_id, ...input.assistant_technician_ids].filter(Boolean))] as string[];
  if (techIds.length > 0) {
    const invalid = await findInvalidTechnicians(tenantId, techIds);
    if (invalid.length > 0) return { ok: false, invalidTechnician: invalid };
  }
  if (input.lead_technician_id && input.assistant_technician_ids.includes(input.lead_technician_id)) {
    return { ok: false, invalidTechnician: [input.lead_technician_id] };
  }

  const wasAssigned = current.technician_id !== null;

  // Optimistic-concurrency guarded update of the lead + version.
  const { data: updated, error } = await db
    .from("visits")
    .update({ technician_id: input.lead_technician_id, version: input.version + 1 })
    .eq("id", visitId)
    .eq("tenant_id", tenantId)
    .eq("version", input.version)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`[db] assignVisit: ${error.message}`);
  if (!updated) {
    const fresh = await getVisitRaw(visitId, tenantId);
    return fresh ? { ok: false, conflict: true, currentVersion: fresh.version ?? 1 } : { ok: false, notFound: true };
  }

  // Replace the assignment set.
  await db.from("visit_assignments").delete().eq("visit_id", visitId).eq("tenant_id", tenantId);
  const rows: Array<{ tenant_id: string; visit_id: string; technician_id: string; role: string; created_by: string }> = [];
  if (input.lead_technician_id) {
    rows.push({ tenant_id: tenantId, visit_id: visitId, technician_id: input.lead_technician_id, role: "lead", created_by: actorUserId });
  }
  for (const aid of input.assistant_technician_ids) {
    rows.push({ tenant_id: tenantId, visit_id: visitId, technician_id: aid, role: "assistant", created_by: actorUserId });
  }
  if (rows.length > 0) {
    const { error: insErr } = await db.from("visit_assignments").insert(rows);
    if (insErr) throw new Error(`[db] assignVisit insert: ${insErr.message}`);
  }

  await recordScheduleEvent({
    tenantId,
    visitId,
    eventType: wasAssigned ? "reassigned" : "assigned",
    actorUserId,
    oldValue: { lead: current.technician_id },
    newValue: { lead: input.lead_technician_id, assistants: input.assistant_technician_ids },
  });

  const refreshed = await getVisitWithSchedule(visitId, tenantId);
  return refreshed ? { ok: true, data: refreshed } : { ok: false, notFound: true };
}

// ─── Reschedule ───────────────────────────────────────────────────────────────

export async function rescheduleVisit(
  visitId: string,
  input: RescheduleVisitInput,
  tenantId: string,
  timeZone: string,
  actorUserId: string
): Promise<ScheduleWriteResult> {
  const current = await getVisitRaw(visitId, tenantId);
  if (!current) return { ok: false, notFound: true };
  if ((current.version ?? 1) !== input.version) {
    return { ok: false, conflict: true, currentVersion: current.version ?? 1 };
  }

  const patch: Record<string, unknown> = {
    scheduled_date: input.scheduled_date,
    version: input.version + 1,
    reschedule_reason: input.reason ?? null,
  };
  if (input.all_day !== undefined) patch.all_day = input.all_day;
  if (input.arrival_window_start !== undefined) patch.arrival_window_start = input.arrival_window_start;
  if (input.arrival_window_end !== undefined) patch.arrival_window_end = input.arrival_window_end;
  if (input.duration_minutes !== undefined) patch.estimated_duration_minutes = input.duration_minutes;

  if (input.all_day) {
    patch.planned_start_at = null;
    patch.planned_end_at = null;
  } else if (input.start_time) {
    const startUtc = wallTimeToUtc(input.scheduled_date, input.start_time, timeZone);
    patch.planned_start_at = startUtc;
    const dur = input.duration_minutes ?? current.estimated_duration_minutes ?? 60;
    patch.planned_end_at = new Date(new Date(startUtc).getTime() + dur * 60_000).toISOString();
  }

  const { data: updated, error } = await db
    .from("visits")
    .update(patch)
    .eq("id", visitId)
    .eq("tenant_id", tenantId)
    .eq("version", input.version)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`[db] rescheduleVisit: ${error.message}`);
  if (!updated) {
    const fresh = await getVisitRaw(visitId, tenantId);
    return fresh ? { ok: false, conflict: true, currentVersion: fresh.version ?? 1 } : { ok: false, notFound: true };
  }

  await recordScheduleEvent({
    tenantId,
    visitId,
    eventType: "rescheduled",
    actorUserId,
    reason: input.reason,
    oldValue: { scheduled_date: current.scheduled_date, planned_start_at: current.planned_start_at },
    newValue: { scheduled_date: input.scheduled_date, planned_start_at: patch.planned_start_at ?? null },
  });

  const refreshed = await getVisitWithSchedule(visitId, tenantId);
  return refreshed ? { ok: true, data: refreshed } : { ok: false, notFound: true };
}

// ─── Manual route order ───────────────────────────────────────────────────────

export async function setRouteOrder(
  visitIds: string[],
  tenantId: string,
  actorUserId: string
): Promise<{ ok: true; count: number } | { ok: false; invalid: string[] }> {
  // All ids must belong to the tenant.
  const { data: found, error } = await db
    .from("visits")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", visitIds);
  if (error) throw new Error(`[db] setRouteOrder validate: ${error.message}`);
  const foundIds = new Set(((found ?? []) as { id: string }[]).map((r) => r.id));
  const invalid = visitIds.filter((id) => !foundIds.has(id));
  if (invalid.length > 0) return { ok: false, invalid };

  for (let i = 0; i < visitIds.length; i++) {
    const { error: upErr } = await db
      .from("visits")
      .update({ route_order: i })
      .eq("id", visitIds[i])
      .eq("tenant_id", tenantId);
    if (upErr) throw new Error(`[db] setRouteOrder update: ${upErr.message}`);
  }

  await recordScheduleEvent({
    tenantId,
    visitId: visitIds[0],
    eventType: "route_reordered",
    actorUserId,
    newValue: { order: visitIds },
  });

  return { ok: true, count: visitIds.length };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RawVisit = {
  id: string;
  technician_id: string | null;
  version: number | null;
  scheduled_date: string;
  planned_start_at: string | null;
  estimated_duration_minutes: number | null;
};

async function getVisitRaw(visitId: string, tenantId: string): Promise<RawVisit | undefined> {
  const { data, error } = await db
    .from("visits")
    .select("id, technician_id, version, scheduled_date, planned_start_at, estimated_duration_minutes")
    .eq("id", visitId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`[db] getVisitRaw: ${error.message}`);
  return (data as RawVisit | null) ?? undefined;
}

export async function getVisitWithSchedule(visitId: string, tenantId: string): Promise<VisitWithSchedule | undefined> {
  const { data, error } = await db.from("visits").select(FEED_SELECT).eq("id", visitId).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`[db] getVisitWithSchedule: ${error.message}`);
  if (!data) return undefined;
  const row = data as unknown as FeedRow;
  const assignments = await getAssignmentsForVisits(tenantId, [visitId]);
  return mapFeedRow(row, assignments.get(visitId) ?? []);
}

async function findInvalidTechnicians(tenantId: string, techIds: string[]): Promise<string[]> {
  const { data, error } = await db
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", techIds);
  if (error) throw new Error(`[db] findInvalidTechnicians: ${error.message}`);
  const valid = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  return techIds.filter((id) => !valid.has(id));
}

// ─── Schedule events ──────────────────────────────────────────────────────────

export async function recordScheduleEvent(entry: {
  tenantId: string;
  visitId?: string | null;
  scheduleId?: string | null;
  eventType: ScheduleEventType;
  actorUserId?: string | null;
  reason?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await db.from("schedule_events").insert({
    tenant_id: entry.tenantId,
    visit_id: entry.visitId ?? null,
    schedule_id: entry.scheduleId ?? null,
    event_type: entry.eventType,
    actor_user_id: entry.actorUserId ?? null,
    reason: entry.reason ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
  });
  if (error) console.error("[db] recordScheduleEvent:", error.message);
}

export async function getScheduleEventsForVisit(visitId: string, tenantId: string): Promise<ScheduleEvent[]> {
  const { data, error } = await db
    .from("schedule_events")
    .select("*")
    .eq("visit_id", visitId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] getScheduleEventsForVisit: ${error.message}`);
  return (data ?? []) as ScheduleEvent[];
}
