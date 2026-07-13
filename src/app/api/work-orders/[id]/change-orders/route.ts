import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listChangeOrders, createChangeOrder } from "@/lib/db/queries/change-orders";
import { CreateChangeOrderSchema } from "@/lib/validation/change-order";
import { redactChangeOrderCosts } from "@/lib/change-orders/redact-costs";
import { redactChangeOrdersCosts } from "@/lib/change-orders/redact-list";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { recordAuditEvent } from "@/lib/security/audit";

function canViewCosts(role: string): boolean {
  return rolePermissions[role as UserRole]?.canViewItemCosts ?? false;
}

// GET /api/work-orders/[id]/change-orders — list change orders for a work order.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewChangeOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const list = await listChangeOrders(tenantId, { q: undefined, work_order_id: id });
    return NextResponse.json({ data: redactChangeOrdersCosts(list, canViewCosts(auth.session.user.role)) });
  } catch (err) {
    console.error("[api] GET /api/work-orders/[id]/change-orders:", err);
    return NextResponse.json({ error: "Failed to load change orders" }, { status: 500 });
  }
}

// POST /api/work-orders/[id]/change-orders — create a new draft change order.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageChangeOrders");
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

  const parsed = CreateChangeOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await createChangeOrder(id, parsed.data, tenantId, userId);
    if (!result.ok) {
      if ("workOrderNotFound" in result) return NextResponse.json({ error: "Work order not found" }, { status: 404 });
      return NextResponse.json({ error: "A referenced pricebook item was not found for this tenant", badItemId: result.badItemId }, { status: 422 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "change_order.created",
      description: `Created change order ${result.data.change_order_number} for work order ${id}`,
      entityType: "change_order",
      entityId: result.data.id,
    });

    return NextResponse.json({ data: redactChangeOrderCosts(result.data, canViewCosts(auth.session.user.role)) }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/work-orders/[id]/change-orders:", err);
    return NextResponse.json({ error: "Failed to create change order" }, { status: 500 });
  }
}
