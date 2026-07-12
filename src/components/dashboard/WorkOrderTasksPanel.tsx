"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { useApiQuery } from "@/lib/utils/useApiQuery";
import { SectionCard } from "@/components/dashboard/WorkOrderDetail";
import type { WorkOrderTask } from "@/types/work-order-project";
import { cn } from "@/lib/utils";

export function WorkOrderTasksPanel({ workOrderId }: { workOrderId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const perms = role ? rolePermissions[role] : undefined;
  const canManage = perms?.canManageWorkOrderTasks ?? false;

  const { data: tasks, loading, retry } = useApiQuery<WorkOrderTask[]>(`/api/work-orders/${workOrderId}/tasks`);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addTask() {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        setNewTitle("");
        retry();
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggleComplete(task: WorkOrderTask) {
    setBusyId(task.id);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: !task.is_completed }),
      });
      if (res.ok) retry();
    } finally {
      setBusyId(null);
    }
  }

  async function removeTask(taskId: string) {
    setBusyId(taskId);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/tasks/${taskId}`, { method: "DELETE" });
      if (res.ok) retry();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SectionCard title="Tasks">
      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {!loading && (tasks ?? []).length === 0 && <p className="text-sm text-slate-400">No internal tasks yet.</p>}
      {!loading && (tasks ?? []).length > 0 && (
        <ul className="space-y-1.5">
          {(tasks ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-slate-50">
              <button
                type="button"
                onClick={() => toggleComplete(t)}
                disabled={busyId === t.id}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                  t.is_completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
                )}
                aria-pressed={t.is_completed}
              >
                {t.is_completed && "✓"}
              </button>
              <span className={cn("flex-1 text-sm", t.is_completed ? "text-slate-400 line-through" : "text-slate-700")}>
                {t.title}
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => removeTask(t.id)}
                  disabled={busyId === t.id}
                  className="shrink-0 text-slate-300 hover:text-red-500"
                  aria-label="Delete task"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addTask(); }}
            placeholder="Add a task…"
            className="flex-1 rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <button
            type="button"
            onClick={addTask}
            disabled={adding || !newTitle.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </button>
        </div>
      )}
    </SectionCard>
  );
}
