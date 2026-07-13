import { db } from "@/lib/db/client";
import type { WorkOrderTask } from "@/types/work-order-project";
import type { CreateWorkOrderTaskInput, PatchWorkOrderTaskInput } from "@/lib/validation/work-order-project";

type TaskRow = {
  id: string;
  tenant_id: string;
  work_order_id: string;
  title: string;
  is_completed: boolean;
  assigned_technician_id: string | null;
  due_date: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapTask(row: TaskRow): WorkOrderTask {
  return { ...row };
}

export async function listWorkOrderTasks(workOrderId: string, tenantId: string): Promise<WorkOrderTask[]> {
  const { data, error } = await db
    .from("work_order_tasks")
    .select("*")
    .eq("work_order_id", workOrderId)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`[db] listWorkOrderTasks: ${error.message}`);
  return ((data ?? []) as TaskRow[]).map(mapTask);
}

export async function createWorkOrderTask(
  workOrderId: string,
  input: CreateWorkOrderTaskInput,
  tenantId: string,
  userId: string
): Promise<{ ok: true; data: WorkOrderTask } | { ok: false; workOrderNotFound: true }> {
  const { data: wo } = await db.from("work_orders").select("id").eq("id", workOrderId).eq("tenant_id", tenantId).maybeSingle();
  if (!wo) return { ok: false, workOrderNotFound: true };

  const { data, error } = await db
    .from("work_order_tasks")
    .insert({
      tenant_id: tenantId,
      work_order_id: workOrderId,
      title: input.title,
      assigned_technician_id: input.assigned_technician_id ?? null,
      due_date: input.due_date ?? null,
      sort_order: input.sort_order,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`[db] createWorkOrderTask: ${error.message}`);
  return { ok: true, data: mapTask(data as TaskRow) };
}

export async function patchWorkOrderTask(
  id: string,
  patch: PatchWorkOrderTaskInput,
  tenantId: string
): Promise<{ ok: true; data: WorkOrderTask } | { ok: false; notFound: true }> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) payload[k] = v;
  }
  const { data, error } = await db
    .from("work_order_tasks")
    .update(payload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] patchWorkOrderTask: ${error.message}`);
  if (!data) return { ok: false, notFound: true };
  return { ok: true, data: mapTask(data as TaskRow) };
}

export async function deleteWorkOrderTask(id: string, tenantId: string): Promise<{ ok: boolean }> {
  const { data, error } = await db
    .from("work_order_tasks")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`[db] deleteWorkOrderTask: ${error.message}`);
  return { ok: !!data };
}
