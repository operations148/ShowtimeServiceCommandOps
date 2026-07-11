import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { skipOccurrence, listExceptions } from "@/lib/db/queries/recurring-control";
import { SkipOccurrenceSchema } from "@/lib/validation/scheduling";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/recurring-schedules/[id]/skip — list exceptions.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewSchedule");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;
  try {
    return NextResponse.json({ data: await listExceptions(id, tenantId) });
  } catch (err) {
    console.error("[api] GET /api/recurring-schedules/[id]/skip:", err);
    return NextResponse.json({ error: "Failed to load exceptions" }, { status: 500 });
  }
}

// POST /api/recurring-schedules/[id]/skip — add a skip exception for one date.
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

  const parsed = SkipOccurrenceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await skipOccurrence(id, parsed.data, tenantId, userId);
    if (!result.ok) {
      if ("duplicate" in result) {
        return NextResponse.json({ error: "That occurrence is already skipped" }, { status: 409 });
      }
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }
    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "recurring.occurrence_skipped",
      description: `Skipped occurrence ${parsed.data.exception_date} for schedule ${id}`,
      entityType: "recurring_schedule",
      entityId: id,
      metadata: { exception_date: parsed.data.exception_date },
    });
    return NextResponse.json({ data: { skipped: parsed.data.exception_date } }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/recurring-schedules/[id]/skip:", err);
    return NextResponse.json({ error: "Failed to skip occurrence" }, { status: 500 });
  }
}
