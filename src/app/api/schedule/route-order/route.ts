import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { setRouteOrder } from "@/lib/db/queries/schedule";
import { RouteOrderSchema } from "@/lib/validation/scheduling";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/schedule/route-order — manual route ordering for a tech's day.
export async function POST(request: NextRequest) {
  const auth = await requirePermission("canManageSchedule");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RouteOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await setRouteOrder(parsed.data.visit_ids, tenantId, userId);
    if (!result.ok) {
      return NextResponse.json({ error: "One or more visits are not valid for this tenant", invalid: result.invalid }, { status: 422 });
    }
    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "visit.route_reordered",
      description: `Reordered ${result.count} visits`,
      metadata: { count: result.count },
    });
    return NextResponse.json({ data: { count: result.count } });
  } catch (err) {
    console.error("[api] POST /api/schedule/route-order:", err);
    return NextResponse.json({ error: "Failed to set route order" }, { status: 500 });
  }
}
