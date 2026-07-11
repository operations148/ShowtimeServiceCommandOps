import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { rescheduleVisit } from "@/lib/db/queries/schedule";
import { getTenantTimezone } from "@/lib/db/queries/tenant-settings";
import { RescheduleVisitSchema } from "@/lib/validation/scheduling";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/visits/[id]/reschedule — versioned; also the API target for
// drag-and-drop moves (the UI sends the dropped date/time here).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageSchedule");
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

  const parsed = RescheduleVisitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const timeZone = await getTenantTimezone(tenantId);
    const result = await rescheduleVisit(id, parsed.data, tenantId, timeZone, userId);
    if (!result.ok) {
      if ("conflict" in result) {
        return NextResponse.json({ error: "This visit was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      }
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "visit.rescheduled",
      description: `Rescheduled visit ${id} to ${parsed.data.scheduled_date}`,
      entityType: "visit",
      entityId: id,
      metadata: { to: parsed.data.scheduled_date, reason: parsed.data.reason ?? null },
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] POST /api/visits/[id]/reschedule:", err);
    return NextResponse.json({ error: "Failed to reschedule visit" }, { status: 500 });
  }
}
