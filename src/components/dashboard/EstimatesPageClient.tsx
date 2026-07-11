"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Flag,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { EstimateHandoffStatus } from "@/types/work-order";
import type { WorkOrderWithRelations } from "@/types/work-order";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/ui/ErrorState";
import { useApiQuery } from "@/lib/utils/useApiQuery";
import { cn } from "@/lib/utils";

// ─── Config ───────────────────────────────────────────────────────────────────

const ESTIMATE_STATUS_CONFIG: Record<
  EstimateHandoffStatus,
  { label: string; className: string; icon: React.ElementType } | null
> = {
  [EstimateHandoffStatus.NOT_NEEDED]: null,
  [EstimateHandoffStatus.FLAGGED]:      { label: "Flagged",       className: "bg-amber-50 text-amber-700 border border-amber-200",       icon: Flag },
  [EstimateHandoffStatus.SENT_TO_GHL]:  { label: "Sent to GHL",   className: "bg-blue-50 text-blue-700 border border-blue-200",          icon: Send },
  [EstimateHandoffStatus.ESTIMATE_SENT]:{ label: "Estimate Sent", className: "bg-cyan-50 text-cyan-700 border border-cyan-200",          icon: FileText },
  [EstimateHandoffStatus.APPROVED]:     { label: "Approved",      className: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: CheckCircle2 },
  [EstimateHandoffStatus.DECLINED]:     { label: "Declined",      className: "bg-red-50 text-red-600 border border-red-200",             icon: XCircle },
};

const STAT_STATUSES: { status: EstimateHandoffStatus; label: string; accent: string; icon: React.ElementType }[] = [
  { status: EstimateHandoffStatus.FLAGGED,       label: "Flagged",       accent: "text-amber-600",   icon: Flag },
  { status: EstimateHandoffStatus.SENT_TO_GHL,   label: "Sent to GHL",   accent: "text-blue-600",    icon: Send },
  { status: EstimateHandoffStatus.ESTIMATE_SENT, label: "Estimate Sent", accent: "text-cyan-600",    icon: FileText },
  { status: EstimateHandoffStatus.APPROVED,      label: "Approved",      accent: "text-emerald-600", icon: CheckCircle2 },
  { status: EstimateHandoffStatus.DECLINED,      label: "Declined",      accent: "text-red-500",     icon: XCircle },
];

// Allowed next actions per current status
const STATUS_ACTIONS: Partial<Record<EstimateHandoffStatus, { label: string; next: EstimateHandoffStatus }[]>> = {
  [EstimateHandoffStatus.FLAGGED]:      [{ label: "Mark Sent",     next: EstimateHandoffStatus.ESTIMATE_SENT }],
  [EstimateHandoffStatus.SENT_TO_GHL]:  [{ label: "Mark Sent",     next: EstimateHandoffStatus.ESTIMATE_SENT }],
  [EstimateHandoffStatus.ESTIMATE_SENT]:[
    { label: "Mark Approved", next: EstimateHandoffStatus.APPROVED },
    { label: "Mark Declined", next: EstimateHandoffStatus.DECLINED },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EstimatesPageClient({ embedded = false }: { embedded?: boolean } = {}) {
  const { data, error, loading, retry } = useApiQuery<WorkOrderWithRelations[]>(
    "/api/work-orders?estimate=true"
  );

  const [rows, setRows] = useState<WorkOrderWithRelations[]>([]);
  useEffect(() => { if (data) setRows(data); }, [data]);

  const [statusFilter, setStatusFilter] = useState<EstimateHandoffStatus | "">("");

  const filtered =
    statusFilter === ""
      ? rows
      : rows.filter((wo) => wo.estimate_handoff_status === statusFilter);

  const counts = Object.fromEntries(
    STAT_STATUSES.map(({ status }) => [
      status,
      rows.filter((wo) => wo.estimate_handoff_status === status).length,
    ])
  ) as Record<EstimateHandoffStatus, number>;

  function handleStatusUpdate(woId: string, newStatus: EstimateHandoffStatus) {
    setRows((prev) =>
      prev.map((wo) =>
        wo.id === woId ? { ...wo, estimate_handoff_status: newStatus } : wo
      )
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-7xl space-y-6"}>
      {/* Header — hidden when embedded inside the estimates workspace tabs */}
      {!embedded && (
        <div>
          <Breadcrumb items={[{ label: "Estimates" }]} className="mb-2" />
          <h2 className="font-display text-2xl font-bold text-slate-900">Estimates</h2>
          <p className="mt-1 text-sm text-slate-500">
            Jobs flagged by technicians as needing an estimate — handoff to GHL.
          </p>
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STAT_STATUSES.map(({ status, label, accent, icon: Icon }) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(statusFilter === status ? "" : status)}
            className={cn(
              "rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition-colors",
              statusFilter === status
                ? "border-brand-300 ring-1 ring-brand-300"
                : "border-border hover:border-slate-300"
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4 shrink-0", accent)} />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </span>
            </div>
            <p className="mt-1.5 font-display text-2xl font-bold text-slate-900">
              {loading ? "—" : counts[status]}
            </p>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EstimateHandoffStatus | "")}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">All Statuses</option>
          {STAT_STATUSES.map(({ status, label }) => (
            <option key={status} value={status}>{label}</option>
          ))}
        </select>
        {statusFilter !== "" && (
          <button
            type="button"
            onClick={() => setStatusFilter("")}
            className="text-xs text-slate-500 underline hover:text-slate-700"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Content */}
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyEstimates hasFilter={statusFilter !== ""} />
      ) : (
        <EstimatesTable workOrders={filtered} onStatusUpdate={handleStatusUpdate} />
      )}
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function EstimatesTable({
  workOrders,
  onStatusUpdate,
}: {
  workOrders: WorkOrderWithRelations[];
  onStatusUpdate: (woId: string, newStatus: EstimateHandoffStatus) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="border-b border-border bg-slate-50/60 px-6 py-3">
        <p className="text-sm text-slate-500">
          <span className="font-medium text-slate-700">{workOrders.length}</span>{" "}
          {workOrders.length === 1 ? "estimate" : "estimates"}
        </p>
      </div>

      {/* Desktop */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50/30">
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">WO #</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Property / Customer</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Technician</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Notes</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Flagged</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Estimate Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {workOrders.map((wo) => (
              <TableRow key={wo.id} wo={wo} onStatusUpdate={onStatusUpdate} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="divide-y divide-border sm:hidden">
        {workOrders.map((wo) => (
          <MobileRow key={wo.id} wo={wo} onStatusUpdate={onStatusUpdate} />
        ))}
      </ul>
    </div>
  );
}

function TableRow({
  wo,
  onStatusUpdate,
}: {
  wo: WorkOrderWithRelations;
  onStatusUpdate: (woId: string, newStatus: EstimateHandoffStatus) => void;
}) {
  const cfg = ESTIMATE_STATUS_CONFIG[wo.estimate_handoff_status];
  const actions = STATUS_ACTIONS[wo.estimate_handoff_status] ?? [];
  const [updating, setUpdating] = useState(false);

  async function handleAction(next: EstimateHandoffStatus) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate_handoff_status: next }),
      });
      if (res.ok) onStatusUpdate(wo.id, next);
    } catch {
      // silent — user can retry
    } finally {
      setUpdating(false);
    }
  }

  return (
    <tr className="transition-colors hover:bg-slate-50/60">
      <td className="whitespace-nowrap px-6 py-4">
        <span className="font-mono text-xs font-semibold text-slate-500">{wo.wo_number}</span>
      </td>
      <td className="px-6 py-4">
        <p className="max-w-[200px] truncate font-medium text-slate-900">{wo.property_address || "—"}</p>
        <p className="max-w-[200px] truncate text-xs text-slate-500">{wo.property_customer_name || "—"}</p>
      </td>
      <td className="px-6 py-4">
        <span className="text-slate-600">
          {wo.assigned_technician_name ?? <span className="italic text-slate-400">Unassigned</span>}
        </span>
      </td>
      <td className="px-6 py-4">
        {wo.estimate_notes ? (
          <span
            className="block max-w-[180px] cursor-default truncate text-xs text-slate-600"
            title={wo.estimate_notes}
          >
            {wo.estimate_notes.length > 60
              ? wo.estimate_notes.slice(0, 60) + "…"
              : wo.estimate_notes}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500">
        {formatDate(wo.created_at)}
      </td>
      <td className="px-6 py-4">
        {cfg ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", cfg.className)}>
            <cfg.icon className="h-3 w-3" />
            {cfg.label}
          </span>
        ) : null}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1.5">
          {actions.map(({ label, next }) => (
            <button
              key={next}
              type="button"
              disabled={updating}
              onClick={() => void handleAction(next)}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                next === EstimateHandoffStatus.APPROVED
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : next === EstimateHandoffStatus.DECLINED
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {updating && <Loader2 className="h-3 w-3 animate-spin" />}
              {label}
            </button>
          ))}
          <Link
            href={`/dashboard/work-orders/${wo.id}`}
            className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            View
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </td>
    </tr>
  );
}

function MobileRow({
  wo,
  onStatusUpdate,
}: {
  wo: WorkOrderWithRelations;
  onStatusUpdate: (woId: string, newStatus: EstimateHandoffStatus) => void;
}) {
  const cfg = ESTIMATE_STATUS_CONFIG[wo.estimate_handoff_status];
  const actions = STATUS_ACTIONS[wo.estimate_handoff_status] ?? [];
  const [updating, setUpdating] = useState(false);

  async function handleAction(next: EstimateHandoffStatus) {
    setUpdating(true);
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate_handoff_status: next }),
      });
      if (res.ok) onStatusUpdate(wo.id, next);
    } catch {
      // silent
    } finally {
      setUpdating(false);
    }
  }

  return (
    <li className="px-4 py-4">
      <Link
        href={`/dashboard/work-orders/${wo.id}`}
        className="flex items-center gap-3 hover:opacity-80"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-400">{wo.wo_number}</span>
            {cfg && (
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cfg.className)}>
                <cfg.icon className="h-3 w-3" />
                {cfg.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{wo.title}</p>
          <p className="text-xs text-slate-500">{wo.property_customer_name || wo.property_address || "—"}</p>
          {wo.estimate_notes && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">{wo.estimate_notes}</p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
      </Link>
      {actions.length > 0 && (
        <div className="mt-2 flex gap-2">
          {actions.map(({ label, next }) => (
            <button
              key={next}
              type="button"
              disabled={updating}
              onClick={() => void handleAction(next)}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                next === EstimateHandoffStatus.APPROVED
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : next === EstimateHandoffStatus.DECLINED
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-slate-200 bg-white text-slate-600"
              )}
            >
              {updating && <Loader2 className="h-3 w-3 animate-spin" />}
              {label}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

function EmptyEstimates({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white py-16 text-center shadow-sm">
      <FileText className="h-10 w-10 text-slate-200" />
      <p className="text-sm font-medium text-slate-500">
        {hasFilter ? "No estimates match this filter" : "No estimates flagged yet"}
      </p>
      <p className="text-xs text-slate-400">
        {hasFilter
          ? "Try clearing the status filter to see all estimates."
          : "When a technician flags a job as needing an estimate, it will appear here."}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-6 py-4 last:border-0">
          <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
        </div>
      ))}
    </div>
  );
}
