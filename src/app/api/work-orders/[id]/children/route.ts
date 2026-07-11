import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getWorkOrderById, createWorkOrder, listChildWorkOrders } from "@/lib/db/queries/work-orders";
import { CreateChildWorkOrderSchema } from "@/lib/validation/work-order-project";
import { recordAuditEvent } from "@/lib/security/audit";
import { db } from "@/lib/db/client";

// GET /api/work-orders/[id]/children — a project's child work orders.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewAllWorkOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    return NextResponse.json({ data: await listChildWorkOrders(id, tenantId) });
  } catch (err) {
    console.error("[api] GET /api/work-orders/[id]/children:", err);
    return NextResponse.json({ error: "Failed to load child work orders" }, { status: 500 });
  }
}

// POST /api/work-orders/[id]/children — create a child work order for a
// multi-day/multi-visit project. Inherits the parent's service category and
// property is left for the admin to assign, mirroring the standalone
// creation form (no property picker on this quick-create path).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canCreateWorkOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const parent = await getWorkOrderById(id, tenantId);
  if (!parent) return NextResponse.json({ error: "Parent work order not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateChildWorkOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const child = await createWorkOrder(
      {
        title: parsed.data.title,
        service_category: parent.service_category,
        scheduled_date: parsed.data.scheduled_date,
        priority: parent.priority,
        description: undefined,
        assigned_technician_id: undefined,
      },
      tenantId,
      id
    );

    // Mark the parent as a multi-day project once it has any child.
    await db.from("work_orders").update({ is_multi_day: true }).eq("id", id).eq("tenant_id", tenantId);

    await recordAuditEvent({
      tenantId,
      userId: auth.session.user.id,
      actionType: "work_order.child_created",
      description: `Created child work order ${child.wo_number} under project ${parent.wo_number}`,
      entityType: "work_order",
      entityId: child.id,
      metadata: { parent_work_order_id: id },
    });

    return NextResponse.json({ data: child }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/work-orders/[id]/children:", err);
    return NextResponse.json({ error: "Failed to create child work order" }, { status: 500 });
  }
}
