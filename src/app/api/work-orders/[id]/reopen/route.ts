import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { reopenWorkOrder } from "@/lib/db/queries/work-orders";
import { ReopenWorkOrderSchema } from "@/lib/validation/work-order-project";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/work-orders/[id]/reopen — closed -> needs_follow_up.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canCloseWorkOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReopenWorkOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await reopenWorkOrder(id, tenantId, parsed.data.version);
    if (!result.ok) {
      if ("conflict" in result) return NextResponse.json({ error: "This work order was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      if ("invalidTransition" in result) return NextResponse.json({ error: "Only a closed work order can be reopened" }, { status: 409 });
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId: auth.session.user.id,
      actionType: "work_order.reopened",
      description: `Reopened work order ${result.data.wo_number}`,
      entityType: "work_order",
      entityId: id,
      metadata: { reopen_count: result.data.reopen_count },
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] POST /api/work-orders/[id]/reopen:", err);
    return NextResponse.json({ error: "Failed to reopen work order" }, { status: 500 });
  }
}
