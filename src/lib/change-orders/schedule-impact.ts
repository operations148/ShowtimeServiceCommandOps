import { db } from "@/lib/db/client";
import { ChangeOrderStatus } from "@/types/change-order";
import { getChangeOrderById, recordChangeOrderEvent } from "@/lib/db/queries/change-orders";
import { getVisitWithSchedule, rescheduleVisit } from "@/lib/db/queries/schedule";
import { getTenantTimezone } from "@/lib/db/queries/tenant-settings";

/**
 * Explicit application of an ACCEPTED change order's schedule impact
 * (Phase 5, ADR-0011). Deliberately never automatic — a dispatcher chooses
 * which visit absorbs the schedule impact and confirms the new date, reusing
 * the existing Phase 4 `rescheduleVisit` (so conflict warnings, audit, and
 * optimistic concurrency all apply exactly as they do for any other
 * reschedule).
 */

export type ApplyScheduleImpactResult =
  | { ok: true }
  | { ok: false; reason: "change_order_not_found" | "not_accepted" | "no_schedule_impact" | "already_applied" | "visit_not_found" | "reschedule_failed"; detail?: string };

export async function applyScheduleImpact(
  changeOrderId: string,
  tenantId: string,
  input: { visitId: string; newScheduledDate: string },
  actor: { userId: string; name?: string | null }
): Promise<ApplyScheduleImpactResult> {
  const co = await getChangeOrderById(changeOrderId, tenantId);
  if (!co) return { ok: false, reason: "change_order_not_found" };
  if (co.status !== ChangeOrderStatus.ACCEPTED) return { ok: false, reason: "not_accepted" };
  if (!co.schedule_impact_days && !co.schedule_impact_note) return { ok: false, reason: "no_schedule_impact" };
  if (co.schedule_impact_applied_at) return { ok: false, reason: "already_applied" };

  const visit = await getVisitWithSchedule(input.visitId, tenantId);
  if (!visit) return { ok: false, reason: "visit_not_found" };

  const timeZone = await getTenantTimezone(tenantId);
  const result = await rescheduleVisit(
    input.visitId,
    { version: visit.version, scheduled_date: input.newScheduledDate, reason: `Change order ${co.change_order_number} schedule impact` },
    tenantId,
    timeZone,
    actor.userId
  );
  if (!result.ok) {
    return { ok: false, reason: "reschedule_failed", detail: "conflict" in result ? "stale visit version" : "invalid" };
  }

  const { error } = await db
    .from("change_orders")
    .update({ schedule_impact_applied_at: new Date().toISOString(), schedule_impact_applied_by: actor.userId })
    .eq("id", changeOrderId)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`[change-orders] applyScheduleImpact: ${error.message}`);

  await recordChangeOrderEvent({
    changeOrderId,
    tenantId,
    eventType: "schedule_impact_applied",
    actorUserId: actor.userId,
    actorName: actor.name ?? null,
    metadata: { visit_id: input.visitId, new_scheduled_date: input.newScheduledDate },
  });

  return { ok: true };
}
