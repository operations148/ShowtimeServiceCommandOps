import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth, requirePermission, getTenantId, isTechnicianScoped } from "@/lib/auth/api-auth";
import { listWorkOrderTasks, patchWorkOrderTask, deleteWorkOrderTask } from "@/lib/db/queries/work-order-tasks";
import { PatchWorkOrderTaskSchema } from "@/lib/validation/work-order-project";
import { recordAuditEvent } from "@/lib/security/audit";

// PATCH /api/work-orders/[id]/tasks/[taskId]
// A technician may mark their OWN assigned task complete (is_completed only);
// broader edits require canManageWorkOrderTasks.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id, taskId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchWorkOrderTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const scoped = isTechnicianScoped(auth.session);
  if (scoped) {
    const tasks = await listWorkOrderTasks(id, tenantId);
    const mine = tasks.find((t) => t.id === taskId)?.assigned_technician_id === auth.session.user.id;
    if (!mine) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const onlyCompletion = Object.keys(parsed.data).every((k) => k === "is_completed");
    if (!onlyCompletion) {
      return NextResponse.json({ error: "Technicians may only update completion status" }, { status: 403 });
    }
  }

  try {
    const result = await patchWorkOrderTask(taskId, parsed.data, tenantId);
    if (!result.ok) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    await recordAuditEvent({
      tenantId,
      userId: auth.session.user.id,
      actionType: "work_order_task.updated",
      description: `Updated task "${result.data.title}"`,
      entityType: "work_order_task",
      entityId: taskId,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] PATCH /api/work-orders/[id]/tasks/[taskId]:", err);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

// DELETE /api/work-orders/[id]/tasks/[taskId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const auth = await requirePermission("canManageWorkOrderTasks");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { taskId } = await params;

  try {
    const result = await deleteWorkOrderTask(taskId, tenantId);
    if (!result.ok) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    await recordAuditEvent({
      tenantId,
      userId: auth.session.user.id,
      actionType: "work_order_task.deleted",
      description: `Deleted task ${taskId}`,
      entityType: "work_order_task",
      entityId: taskId,
    });

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    console.error("[api] DELETE /api/work-orders/[id]/tasks/[taskId]:", err);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
