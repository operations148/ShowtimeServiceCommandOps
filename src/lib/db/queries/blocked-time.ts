import { db } from "@/lib/db/client";
import type { BlockedTime, TechnicianAvailability } from "@/types/scheduling";
import type { CreateBlockedTimeInput, SetAvailabilityInput } from "@/lib/validation/scheduling";
import { recordScheduleEvent } from "./schedule";

// ─── Blocked time ─────────────────────────────────────────────────────────────

export async function listBlockedTime(
  tenantId: string,
  opts: { fromUtc: string; toUtc: string; technicianId?: string }
): Promise<BlockedTime[]> {
  let q = db
    .from("blocked_time")
    .select("*")
    .eq("tenant_id", tenantId)
    // overlap with [fromUtc, toUtc): starts before window end AND ends after window start
    .lt("starts_at", opts.toUtc)
    .gt("ends_at", opts.fromUtc)
    .order("starts_at", { ascending: true });
  if (opts.technicianId) q = q.eq("technician_id", opts.technicianId);

  const { data, error } = await q;
  if (error) throw new Error(`[db] listBlockedTime: ${error.message}`);
  return (data ?? []) as BlockedTime[];
}

export async function createBlockedTime(
  input: CreateBlockedTimeInput,
  tenantId: string,
  actorUserId: string
): Promise<{ ok: true; data: BlockedTime } | { ok: false; invalidTechnician: true }> {
  // Tenant-scoped technician check.
  const { data: tech } = await db
    .from("users")
    .select("id")
    .eq("id", input.technician_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!tech) return { ok: false, invalidTechnician: true };

  const { data, error } = await db
    .from("blocked_time")
    .insert({
      tenant_id: tenantId,
      technician_id: input.technician_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      all_day: input.all_day,
      reason: input.reason ?? null,
      created_by: actorUserId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`[db] createBlockedTime: ${error.message}`);

  await recordScheduleEvent({
    tenantId,
    eventType: "blocked_time_created",
    actorUserId,
    newValue: { technician_id: input.technician_id, starts_at: input.starts_at, ends_at: input.ends_at },
  });

  return { ok: true, data: data as BlockedTime };
}

export async function deleteBlockedTime(
  id: string,
  tenantId: string,
  actorUserId: string
): Promise<{ ok: boolean }> {
  const { data, error } = await db
    .from("blocked_time")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`[db] deleteBlockedTime: ${error.message}`);
  if (!data) return { ok: false };

  await recordScheduleEvent({ tenantId, eventType: "blocked_time_deleted", actorUserId, oldValue: { id } });
  return { ok: true };
}

// ─── Technician availability ──────────────────────────────────────────────────

export async function getAvailability(tenantId: string, technicianId: string): Promise<TechnicianAvailability[]> {
  const { data, error } = await db
    .from("technician_availability")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("technician_id", technicianId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(`[db] getAvailability: ${error.message}`);
  return (data ?? []) as TechnicianAvailability[];
}

/** Replaces the technician's entire weekly availability template atomically-ish. */
export async function setAvailability(
  input: SetAvailabilityInput,
  tenantId: string
): Promise<{ ok: true; data: TechnicianAvailability[] } | { ok: false; invalidTechnician: true }> {
  const { data: tech } = await db
    .from("users")
    .select("id")
    .eq("id", input.technician_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!tech) return { ok: false, invalidTechnician: true };

  const { error: delErr } = await db
    .from("technician_availability")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("technician_id", input.technician_id);
  if (delErr) throw new Error(`[db] setAvailability delete: ${delErr.message}`);

  if (input.windows.length > 0) {
    const { error: insErr } = await db.from("technician_availability").insert(
      input.windows.map((w) => ({
        tenant_id: tenantId,
        technician_id: input.technician_id,
        day_of_week: w.day_of_week,
        start_time: w.start_time,
        end_time: w.end_time,
      }))
    );
    if (insErr) throw new Error(`[db] setAvailability insert: ${insErr.message}`);
  }

  return { ok: true, data: await getAvailability(tenantId, input.technician_id) };
}
