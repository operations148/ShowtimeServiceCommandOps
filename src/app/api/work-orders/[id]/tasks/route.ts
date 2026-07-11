import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, requireApiAuth, getTenantId, isTechnicianScoped } from "@/lib/auth/api-auth";
import { listWorkOrderTasks, createWorkOrderTask } from "@/lib/db/queries/work-order-tasks";
import { CreateWorkOrderTaskSchema } from "@/lib/validation/work-order-project";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/work-orders/[id]/tasks — technicians may view (to see their own
// assigned tasks); creating/managing broadly requires canManageWorkOrderTasks.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const tasks = await listWorkOrderTasks(id, tenantId);
    // Technicians only see tasks assigned to them.
    const visible = isTechnicianScoped(auth.session)
      ? tasks.filter((t) => t.assigned_technician_id === auth.session.user.id)
      : tasks;
    return NextResponse.json({ data: visible });
  } catch (err) {
    console.error("[api] GET /api/work-orders/[id]/tasks:", err);
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
  }
}

// POST /api/work-orders/[id]/tasks
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageWorkOrderTasks");
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

  const parsed = CreateWorkOrderTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await createWorkOrderTask(id, parsed.data, tenantId, userId);
    if (!result.ok) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "work_order_task.created",
      description: `Created task "${result.data.title}" on work order ${id}`,
      entityType: "work_order_task",
      entityId: result.data.id,
    });

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/work-orders/[id]/tasks:", err);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
