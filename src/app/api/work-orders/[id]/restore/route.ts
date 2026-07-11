import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { restoreWorkOrder } from "@/lib/db/queries/work-orders";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/work-orders/[id]/restore — undo a soft archive.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canCreateWorkOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  try {
    const result = await restoreWorkOrder(id, tenantId);
    if (!result.ok) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "work_order.restored",
      description: `Restored work order ${result.data.wo_number}`,
      entityType: "work_order",
      entityId: id,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] POST /api/work-orders/[id]/restore:", err);
    return NextResponse.json({ error: "Failed to restore work order" }, { status: 500 });
  }
}
