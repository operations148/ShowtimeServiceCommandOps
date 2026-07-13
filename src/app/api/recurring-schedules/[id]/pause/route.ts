import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { setSchedulePaused } from "@/lib/db/queries/recurring-control";
import { RecurringPauseSchema } from "@/lib/validation/scheduling";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/recurring-schedules/[id]/pause — pause or resume (versioned).
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

  const parsed = RecurringPauseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await setSchedulePaused(id, parsed.data.paused, parsed.data.version, tenantId, userId);
    if (!result.ok) {
      if ("conflict" in result) {
        return NextResponse.json({ error: "This schedule was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      }
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }
    await recordAuditEvent({
      tenantId,
      userId,
      actionType: parsed.data.paused ? "recurring.paused" : "recurring.resumed",
      description: `${parsed.data.paused ? "Paused" : "Resumed"} recurring schedule ${id}`,
      entityType: "recurring_schedule",
      entityId: id,
    });
    return NextResponse.json({ data: { paused: parsed.data.paused } });
  } catch (err) {
    console.error("[api] POST /api/recurring-schedules/[id]/pause:", err);
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
  }
}
