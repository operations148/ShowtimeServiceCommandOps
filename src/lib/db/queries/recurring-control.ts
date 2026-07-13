import { db } from "@/lib/db/client";
import type { RecurringException } from "@/types/scheduling";
import type { SkipOccurrenceInput } from "@/lib/validation/scheduling";
import { expandRecurrence, type Frequency } from "@/lib/scheduling/recurrence";
import { localToday, addDaysToDateStr } from "@/lib/scheduling/timezone";
import { recordScheduleEvent } from "./schedule";

type ScheduleRow = {
  id: string;
  tenant_id: string;
  frequency: string;
  day_of_week: number;
  starts_on: string;
  ends_on: string | null;
  paused_at: string | null;
  is_active: boolean;
  version: number | null;
};

async function getScheduleRow(scheduleId: string, tenantId: string): Promise<ScheduleRow | undefined> {
  const { data, error } = await db
    .from("recurring_schedules")
    .select("id, tenant_id, frequency, day_of_week, starts_on, ends_on, paused_at, is_active, version")
    .eq("id", scheduleId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`[db] getScheduleRow: ${error.message}`);
  return (data as ScheduleRow | null) ?? undefined;
}

// ─── Pause / resume ───────────────────────────────────────────────────────────

export type RecurringWriteResult =
  | { ok: true }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true; currentVersion: number };

export async function setSchedulePaused(
  scheduleId: string,
  paused: boolean,
  expectedVersion: number,
  tenantId: string,
  actorUserId: string
): Promise<RecurringWriteResult> {
  const row = await getScheduleRow(scheduleId, tenantId);
  if (!row) return { ok: false, notFound: true };
  if ((row.version ?? 1) !== expectedVersion) {
    return { ok: false, conflict: true, currentVersion: row.version ?? 1 };
  }

  const { data, error } = await db
    .from("recurring_schedules")
    .update({ paused_at: paused ? new Date().toISOString() : null, version: expectedVersion + 1 })
    .eq("id", scheduleId)
    .eq("tenant_id", tenantId)
    .eq("version", expectedVersion)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`[db] setSchedulePaused: ${error.message}`);
  if (!data) {
    const fresh = await getScheduleRow(scheduleId, tenantId);
    return fresh ? { ok: false, conflict: true, currentVersion: fresh.version ?? 1 } : { ok: false, notFound: true };
  }

  await recordScheduleEvent({
    tenantId,
    scheduleId,
    eventType: paused ? "schedule_paused" : "schedule_resumed",
    actorUserId,
  });
  return { ok: true };
}

// ─── Skip occurrence (exception) ──────────────────────────────────────────────

export async function skipOccurrence(
  scheduleId: string,
  input: SkipOccurrenceInput,
  tenantId: string,
  actorUserId: string
): Promise<{ ok: true } | { ok: false; notFound: true } | { ok: false; duplicate: true }> {
  const row = await getScheduleRow(scheduleId, tenantId);
  if (!row) return { ok: false, notFound: true };

  const { error } = await db.from("recurring_exceptions").insert({
    tenant_id: tenantId,
    schedule_id: scheduleId,
    exception_date: input.exception_date,
    reason: input.reason ?? null,
    created_by: actorUserId,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, duplicate: true };
    throw new Error(`[db] skipOccurrence: ${error.message}`);
  }

  await recordScheduleEvent({
    tenantId,
    scheduleId,
    eventType: "occurrence_skipped",
    actorUserId,
    reason: input.reason,
    newValue: { exception_date: input.exception_date },
  });
  return { ok: true };
}

export async function listExceptions(scheduleId: string, tenantId: string): Promise<RecurringException[]> {
  const { data, error } = await db
    .from("recurring_exceptions")
    .select("*")
    .eq("schedule_id", scheduleId)
    .eq("tenant_id", tenantId)
    .order("exception_date", { ascending: true });
  if (error) throw new Error(`[db] listExceptions: ${error.message}`);
  return (data ?? []) as RecurringException[];
}

// ─── Preview (manual, no writes) ──────────────────────────────────────────────

export async function previewSchedule(
  scheduleId: string,
  tenantId: string,
  weeks: number,
  timeZone: string
): Promise<{ dates: string[] } | undefined> {
  const row = await getScheduleRow(scheduleId, tenantId);
  if (!row) return undefined;

  const exceptions = (await listExceptions(scheduleId, tenantId)).map((e) => e.exception_date);
  const windowStart = localToday(timeZone);
  const windowEnd = addDaysToDateStr(windowStart, weeks * 7);

  const dates = expandRecurrence(
    {
      frequency: row.frequency as Frequency,
      dayOfWeek: row.day_of_week,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      pausedAt: row.paused_at,
    },
    { windowStart, windowEnd, exceptions }
  );
  return { dates };
}
