"use client";

import { useState, forwardRef, useImperativeHandle, useEffect, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  User, CalendarDays, X, RefreshCw,
  MoreVertical, Eye, Pencil, Trash2, AlertTriangle, Loader2,
} from "lucide-react";
import { WorkOrderStatus, Priority, ServiceCategory } from "@/types/work-order";
import type { WorkOrderWithRelations } from "@/types/work-order";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useApiQuery } from "@/lib/utils/useApiQuery";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingTableRows } from "@/components/ui/LoadingState";

// ─── Display config ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; className: string }> = {
  [WorkOrderStatus.NEW]:             { label: "New",             className: "bg-slate-100 text-slate-600" },
  [WorkOrderStatus.ASSIGNED]:        { label: "Assigned",        className: "bg-blue-50 text-blue-700" },
  [WorkOrderStatus.SCHEDULED]:       { label: "Scheduled",       className: "bg-indigo-50 text-indigo-700" },
  [WorkOrderStatus.IN_PROGRESS]:     { label: "In Progress",     className: "bg-brand-50 text-brand-700" },
  [WorkOrderStatus.ON_HOLD]:         { label: "On Hold",         className: "bg-amber-50 text-amber-700" },
  [WorkOrderStatus.COMPLETED]:       { label: "Completed",       className: "bg-emerald-50 text-emerald-700" },
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: { label: "Needs Follow-Up", className: "bg-orange-50 text-orange-700" },
  [WorkOrderStatus.ESTIMATE_NEEDED]: { label: "Estimate Needed", className: "bg-amber-50 text-amber-700" },
  [WorkOrderStatus.CLOSED]:          { label: "Closed",          className: "bg-violet-50 text-violet-700" },
  [WorkOrderStatus.CANCELLED]:       { label: "Cancelled",       className: "bg-red-50 text-red-500" },
  [WorkOrderStatus.ARCHIVED]:        { label: "Archived",        className: "bg-slate-100 text-slate-400" },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; className: string }> = {
  [Priority.LOW]:    { label: "Low",    className: "bg-slate-100 text-slate-500" },
  [Priority.NORMAL]: { label: "Normal", className: "bg-slate-100 text-slate-600" },
  [Priority.HIGH]:   { label: "High",   className: "bg-orange-50 text-orange-600" },
  [Priority.URGENT]: { label: "Urgent", className: "bg-red-50 text-red-600 font-semibold" },
};

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  [ServiceCategory.WEEKLY_POOL_MAINTENANCE]:    "Weekly Maintenance",
  [ServiceCategory.POOL_REPAIR]:                "Pool Repair",
  [ServiceCategory.POOL_INSPECTION_DIAGNOSTIC]: "Inspection",
  [ServiceCategory.FILTER_CLEANING]:            "Filter Cleaning",
  [ServiceCategory.HEATER_SERVICE]:             "Heater Service",
  [ServiceCategory.EQUIPMENT_INSTALLATION]:     "Equipment Install",
  [ServiceCategory.POOL_REMODEL]:               "Pool Remodel",
  [ServiceCategory.NEW_CONSTRUCTION]:           "New Construction",
  [ServiceCategory.EMERGENCY_SERVICE]:          "Emergency",
  [ServiceCategory.OTHER]:                      "Other",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Row actions dropdown ─────────────────────────────────────────────────────

function RowActionsMenu({
  wo,
  onDelete,
}: {
  wo: WorkOrderWithRelations;
  onDelete: (wo: WorkOrderWithRelations) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Row actions"
        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-border bg-white py-1 shadow-lg">
          <Link
            href={`/dashboard/work-orders/${wo.id}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Eye className="h-4 w-4 text-slate-400" />
            View Details
          </Link>
          <Link
            href={`/dashboard/work-orders/${wo.id}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="h-4 w-4 text-slate-400" />
            Edit
          </Link>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => { setOpen(false); onDelete(wo); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────

function DeleteConfirmDialog({
  wo,
  onClose,
  onDeleted,
  onError,
}: {
  wo: WorkOrderWithRelations;
  onClose: () => void;
  onDeleted: (id: string, woNumber: string) => void;
  onError: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const isCompleted = wo.status === WorkOrderStatus.COMPLETED;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deleting, onClose]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onDeleted(wo.id, wo.wo_number);
    } catch {
      onError();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Delete Work Order?</h2>
            <p className="mt-1 text-sm text-slate-600">
              Are you sure you want to delete{" "}
              <span className="font-mono font-semibold">{wo.wo_number}</span>
              {" — "}
              <span className="font-semibold">{wo.title}</span>? This will also delete all
              associated visits, checklist records, and photos.{" "}
              <span className="font-medium text-slate-800">This action cannot be undone.</span>
            </p>
          </div>
        </div>

        {isCompleted && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              This job is already completed. Deleting it will remove the completion record.
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-70"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {deleting ? "Deleting…" : "Delete Work Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface WorkOrdersTableHandle {
  refresh: () => void;
}

interface WorkOrdersTableProps {
  onDeleteSuccess?: (woNumber: string) => void;
  onDeleteError?: () => void;
}

export const WorkOrdersTable = forwardRef<WorkOrdersTableHandle, WorkOrdersTableProps>(
  function WorkOrdersTable({ onDeleteSuccess, onDeleteError }, ref) {
    const { data: apiData, error, loading, retry } = useApiQuery<WorkOrderWithRelations[]>("/api/work-orders");
    const { data: session } = useSession();
    const isTechnician = (session?.user as { role?: string } | undefined)?.role === "technician";

    // Local mutable rows — synced from API, supports instant deletion
    const [rows, setRows] = useState<WorkOrderWithRelations[]>([]);
    useEffect(() => {
      if (apiData) setRows(apiData);
    }, [apiData]);

    useImperativeHandle(ref, () => ({ refresh: retry }), [retry]);

    const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | "">("");
    const [categoryFilter, setCategoryFilter] = useState<ServiceCategory | "">("");
    const [deleteTarget, setDeleteTarget] = useState<WorkOrderWithRelations | null>(null);

    const hasFilters = statusFilter !== "" || categoryFilter !== "";

    const filtered = rows.filter((wo) => {
      if (statusFilter && wo.status !== statusFilter) return false;
      if (categoryFilter && wo.service_category !== categoryFilter) return false;
      return true;
    });

    const colCount = isTechnician ? 8 : 9;

    const selectClass =
      "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";

    function handleDeleted(id: string, woNumber: string) {
      setRows((prev) => prev.filter((wo) => wo.id !== id));
      setDeleteTarget(null);
      onDeleteSuccess?.(woNumber);
    }

    function handleDeleteError() {
      setDeleteTarget(null);
      onDeleteError?.();
    }

    if (error) {
      return <ErrorState message={error} onRetry={retry} />;
    }

    return (
      <>
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-slate-50/60 px-4 py-3">
            <p className="text-sm text-slate-500">
              {loading ? (
                <span className="inline-block h-3 w-24 animate-pulse rounded bg-slate-200" />
              ) : hasFilters ? (
                <>
                  <span className="font-medium text-slate-700">{filtered.length}</span>
                  {" of "}
                  <span className="font-medium text-slate-700">{rows.length}</span>
                  {" work orders"}
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-700">{rows.length}</span>
                  {" work orders"}
                </>
              )}
            </p>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as WorkOrderStatus | "")}
                className={selectClass}
                aria-label="Filter by status"
              >
                <option value="">All Statuses</option>
                {Object.values(WorkOrderStatus).map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as ServiceCategory | "")}
                className={selectClass}
                aria-label="Filter by service category"
              >
                <option value="">All Categories</option>
                {Object.values(ServiceCategory).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>

              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setStatusFilter(""); setCategoryFilter(""); }}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 shadow-sm hover:border-slate-300 hover:text-slate-700"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow className="bg-white hover:bg-white">
                <TableHead className="w-24">WO #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-32">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Date
                  </span>
                </TableHead>
                {!isTechnician && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingTableRows rows={5} cols={colCount} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="py-14 text-center text-sm text-slate-400">
                    {rows.length === 0
                      ? "No work orders yet. Create one to get started."
                      : "No work orders match the selected filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((wo) => {
                  const status = STATUS_CONFIG[wo.status];
                  const priority = PRIORITY_CONFIG[wo.priority];

                  return (
                    <TableRow key={wo.id}>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-slate-400">
                            {wo.wo_number}
                          </span>
                          {wo.recurring_schedule_id && (
                            <span
                              title="Auto-generated from a recurring schedule"
                              className="flex items-center justify-center rounded-full bg-brand-50 p-0.5 text-brand-500"
                              aria-label="Recurring"
                            >
                              <RefreshCw className="h-2.5 w-2.5" />
                            </span>
                          )}
                          {wo.ghl_sync_failed && (
                            <span
                              title="GHL sync failed — status not updated in GoHighLevel"
                              className="flex h-2 w-2 shrink-0 rounded-full bg-amber-500"
                              aria-label="GHL sync failed"
                            />
                          )}
                        </span>
                      </TableCell>

                      <TableCell>
                        <Link
                          href={`/dashboard/work-orders/${wo.id}`}
                          className="font-medium text-slate-900 hover:text-brand-600 hover:underline"
                        >
                          {wo.title}
                        </Link>
                      </TableCell>

                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-700">{wo.property_customer_name}</p>
                          <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{wo.property_address}</p>
                        </div>
                      </TableCell>

                      <TableCell>
                        {wo.assigned_technician_name ? (
                          <span className="flex items-center gap-1.5 text-sm text-slate-700">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                              {wo.assigned_technician_name.charAt(0)}
                            </span>
                            {wo.assigned_technician_name}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <User className="h-3.5 w-3.5" />
                            Unassigned
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", status.className)}>
                          {status.label}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", priority.className)}>
                          {priority.label}
                        </span>
                      </TableCell>

                      <TableCell className="text-sm text-slate-600">
                        {CATEGORY_LABELS[wo.service_category]}
                      </TableCell>

                      <TableCell className="text-sm text-slate-500">
                        {wo.scheduled_date ? formatDate(wo.scheduled_date) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </TableCell>

                      {!isTechnician && (
                        <TableCell className="pr-3">
                          <RowActionsMenu wo={wo} onDelete={setDeleteTarget} />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Delete confirmation dialog — rendered outside the table overflow container */}
        {deleteTarget && (
          <DeleteConfirmDialog
            wo={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onDeleted={handleDeleted}
            onError={handleDeleteError}
          />
        )}
      </>
    );
  }
);
