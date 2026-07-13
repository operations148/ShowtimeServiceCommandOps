import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { closeWorkOrder } from "@/lib/db/queries/work-orders";
import { CloseWorkOrderSchema } from "@/lib/validation/work-order-project";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/work-orders/[id]/close — enforces the pending-change-order
// closeout block (ADR-0011).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canCloseWorkOrders");
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

  const parsed = CloseWorkOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await closeWorkOrder(id, tenantId, userId, parsed.data.version);
    if (!result.ok) {
      if ("conflict" in result) return NextResponse.json({ error: "This work order was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      if ("invalidTransition" in result) return NextResponse.json({ error: `Cannot close a work order in status '${result.from}'` }, { status: 409 });
      if ("blockedByChangeOrders" in result) {
        return NextResponse.json(
          { error: "This work order has pending change orders that must be resolved before closeout.", changeOrderIds: result.changeOrderIds },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "work_order.closed",
      description: `Closed work order ${result.data.wo_number}`,
      entityType: "work_order",
      entityId: id,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] POST /api/work-orders/[id]/close:", err);
    return NextResponse.json({ error: "Failed to close work order" }, { status: 500 });
  }
}
