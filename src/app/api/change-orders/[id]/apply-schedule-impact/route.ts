import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { applyScheduleImpact } from "@/lib/change-orders/schedule-impact";
import { ApplyScheduleImpactSchema } from "@/lib/validation/change-order";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/change-orders/[id]/apply-schedule-impact — explicit, never
// automatic (ADR-0011). Dispatcher picks the visit and new date.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canApplyScheduleImpact");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ApplyScheduleImpactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await applyScheduleImpact(
      id,
      tenantId,
      { visitId: parsed.data.visit_id, newScheduledDate: parsed.data.new_scheduled_date },
      { userId, name: (auth.session.user as { name?: string }).name }
    );
    if (!result.ok) {
      const statusMap: Record<string, number> = {
        change_order_not_found: 404,
        visit_not_found: 404,
        not_accepted: 409,
        no_schedule_impact: 422,
        already_applied: 409,
        reschedule_failed: 409,
      };
      return NextResponse.json({ error: scheduleImpactErrorMessage(result.reason), detail: result.detail }, { status: statusMap[result.reason] ?? 500 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "change_order.schedule_impact_applied",
      description: `Applied schedule impact for change order ${id} to visit ${parsed.data.visit_id}`,
      entityType: "change_order",
      entityId: id,
      metadata: { visit_id: parsed.data.visit_id, new_scheduled_date: parsed.data.new_scheduled_date },
    });

    return NextResponse.json({ data: { applied: true } });
  } catch (err) {
    console.error("[api] POST /api/change-orders/[id]/apply-schedule-impact:", err);
    return NextResponse.json({ error: "Failed to apply schedule impact" }, { status: 500 });
  }
}

function scheduleImpactErrorMessage(reason: string): string {
  switch (reason) {
    case "change_order_not_found": return "Change order not found";
    case "visit_not_found": return "Visit not found";
    case "not_accepted": return "Only an accepted change order's schedule impact can be applied";
    case "no_schedule_impact": return "This change order has no recorded schedule impact";
    case "already_applied": return "This change order's schedule impact was already applied";
    case "reschedule_failed": return "Failed to reschedule the visit — it may have changed since you loaded it";
    default: return "Failed to apply schedule impact";
  }
}
