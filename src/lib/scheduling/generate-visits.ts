/**
 * Server-only — generates recurring work orders and visits for active schedules.
 *
 * Idempotency is now DOUBLE-guarded (Phase 4):
 *   1. app-layer existence check (fast path, avoids a wasted insert), and
 *   2. the DB UNIQUE(recurring_schedule_id, scheduled_date) index — a
 *      concurrent or replayed run that races past the check hits 23505 and is
 *      counted as a skip, so duplicates are impossible.
 *
 * Occurrence dates come from the shared, tested recurrence module
 * (src/lib/scheduling/recurrence.ts) using the tenant timezone, honoring
 * paused schedules and skip exceptions (src/lib/scheduling/timezone.ts).
 */

import { db } from "@/lib/db/client";
import { WorkOrderStatus, Priority, ServiceCategory } from "@/types/work-order";
import { VisitStatus } from "@/types/visit";
import { listRecurringSchedules } from "@/lib/db/queries/recurring-schedules";
import { getTenantTimezone } from "@/lib/db/queries/tenant-settings";
import { checklistTemplates } from "@/config/checklist-templates";
import { expandRecurrence, type Frequency } from "@/lib/scheduling/recurrence";
import { localToday, addDaysToDateStr } from "@/lib/scheduling/timezone";
import type { RecurringScheduleWithRelations } from "@/types/recurring-schedule";
import type { ChecklistItem } from "@/types/visit";

const PG_UNIQUE_VIOLATION = "23505";

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  [ServiceCategory.WEEKLY_POOL_MAINTENANCE]:    "Weekly Pool Maintenance",
  [ServiceCategory.POOL_REPAIR]:                "Pool Repair",
  [ServiceCategory.POOL_INSPECTION_DIAGNOSTIC]: "Pool Inspection",
  [ServiceCategory.FILTER_CLEANING]:            "Filter Cleaning",
  [ServiceCategory.HEATER_SERVICE]:             "Heater Service",
  [ServiceCategory.EQUIPMENT_INSTALLATION]:     "Equipment Installation",
  [ServiceCategory.POOL_REMODEL]:               "Pool Remodel",
  [ServiceCategory.NEW_CONSTRUCTION]:           "New Construction",
  [ServiceCategory.EMERGENCY_SERVICE]:          "Emergency Service",
  [ServiceCategory.OTHER]:                      "Service Visit",
};

// ---------------------------------------------------------------------------
// Per-schedule pause + exception lookup (Phase 4)
// ---------------------------------------------------------------------------

async function getScheduleControls(scheduleId: string, tenantId: string): Promise<{ pausedAt: string | null; exceptions: string[] }> {
  const [{ data: sched }, { data: exRows }] = await Promise.all([
    db.from("recurring_schedules").select("paused_at").eq("id", scheduleId).eq("tenant_id", tenantId).maybeSingle(),
    db.from("recurring_exceptions").select("exception_date").eq("schedule_id", scheduleId).eq("tenant_id", tenantId),
  ]);
  return {
    pausedAt: (sched as { paused_at?: string | null } | null)?.paused_at ?? null,
    exceptions: ((exRows ?? []) as { exception_date: string }[]).map((r) => r.exception_date),
  };
}

// ---------------------------------------------------------------------------
// buildChecklist
// ---------------------------------------------------------------------------

function buildChecklist(category: ServiceCategory): ChecklistItem[] {
  const template = checklistTemplates.find((t) => t.serviceCategory === category);
  if (!template) return [];
  return template.items.map((label) => ({
    id: crypto.randomUUID(),
    label,
    completed: false,
  }));
}

// ---------------------------------------------------------------------------
// generateVisitsForSchedule
// ---------------------------------------------------------------------------

export async function generateVisitsForSchedule(
  schedule: RecurringScheduleWithRelations,
  weeksAhead = 4,
  timeZone?: string
): Promise<{ created: number; skipped: number }> {
  const tz = timeZone ?? (await getTenantTimezone(schedule.tenant_id));
  const windowStart = localToday(tz);
  const windowEnd = addDaysToDateStr(windowStart, weeksAhead * 7);

  const { pausedAt, exceptions } = await getScheduleControls(schedule.id, schedule.tenant_id);

  const targetDates = expandRecurrence(
    {
      frequency: schedule.frequency as unknown as Frequency,
      dayOfWeek: schedule.day_of_week,
      startsOn: schedule.starts_on,
      endsOn: schedule.ends_on ?? null,
      pausedAt,
    },
    { windowStart, windowEnd, exceptions }
  );
  let created = 0;
  let skipped = 0;

  for (const dateStr of targetDates) {
    // Fast-path idempotency: skip if a WO already exists for this schedule+date.
    const { data: existing } = await db
      .from("work_orders")
      .select("id")
      .eq("recurring_schedule_id", schedule.id)
      .eq("scheduled_date", dateStr)
      .eq("tenant_id", schedule.tenant_id)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const title = `${CATEGORY_LABELS[schedule.service_category]} — ${schedule.property_customer_name}`;
    const checklist = buildChecklist(schedule.service_category);

    // Create work order
    const { data: wo, error: woError } = await db
      .from("work_orders")
      .insert({
        tenant_id:              schedule.tenant_id,
        property_id:            schedule.property_id,
        title,
        status:                 WorkOrderStatus.ASSIGNED,
        priority:               Priority.NORMAL,
        service_category:       schedule.service_category,
        assigned_technician_id: schedule.technician_id ?? null,
        scheduled_date:         dateStr,
        scheduled_time_start:   schedule.time_start ?? null,
        scheduled_time_end:     schedule.time_end ?? null,
        estimate_handoff_status: "not_needed",
        ghl_sync_failed:        false,
        recurring_schedule_id:  schedule.id,
      })
      .select("id")
      .single();

    if (woError || !wo) {
      // 23505 = the DB UNIQUE(recurring_schedule_id, scheduled_date) index
      // caught a concurrent/replayed run — count as skip, never a duplicate.
      if (woError?.code === PG_UNIQUE_VIOLATION) {
        skipped++;
        continue;
      }
      console.error(`[scheduling] Failed to create WO for schedule ${schedule.id} on ${dateStr}:`, woError?.message);
      continue;
    }

    // Create visit
    const { error: visitError } = await db
      .from("visits")
      .insert({
        tenant_id:        schedule.tenant_id,
        work_order_id:    wo.id,
        property_id:      schedule.property_id,
        technician_id:    schedule.technician_id ?? null,
        status:           VisitStatus.SCHEDULED,
        scheduled_date:   dateStr,
        checklist:        checklist as unknown as Record<string, unknown>[],
        photo_urls:       [],
        estimate_flagged: false,
      });

    if (visitError) {
      console.error(`[scheduling] Failed to create visit for WO ${wo.id}:`, visitError.message);
    }

    created++;
  }

  return { created, skipped };
}

// ---------------------------------------------------------------------------
// generateAllActiveVisits — runs across all active schedules for a tenant
// ---------------------------------------------------------------------------

export async function generateAllActiveVisits(
  tenantId: string,
  weeksAhead = 4
): Promise<{ created: number; skipped: number; schedules: number }> {
  const schedules = await listRecurringSchedules({ tenant_id: tenantId, is_active: true });
  // Resolve the tenant timezone once, not per schedule.
  const timeZone = await getTenantTimezone(tenantId);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const schedule of schedules) {
    const result = await generateVisitsForSchedule(schedule, weeksAhead, timeZone);
    totalCreated += result.created;
    totalSkipped += result.skipped;
  }

  return { created: totalCreated, skipped: totalSkipped, schedules: schedules.length };
}
