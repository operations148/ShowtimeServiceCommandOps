"use client";

import { useState, useMemo } from "react";
import { Printer, RefreshCw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkOrderStatus, ServiceCategory } from "@/types/work-order";
import type { RangeReport, StatusRow, CategoryRow, TechRow } from "@/app/api/reports/range/route";
import { useApiQuery } from "@/lib/utils/useApiQuery";
import { ErrorState } from "@/components/ui/ErrorState";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return toISO(new Date());
}

function getWeekRange(): { from: string; to: string } {
  const today = new Date();
  const dow   = today.getDay(); // 0=Sun
  const delta = dow === 0 ? 6 : dow - 1; // days back to Monday
  const mon   = new Date(today);
  mon.setDate(today.getDate() - delta);
  return { from: toISO(mon), to: todayISO() };
}

function getMonthRange(): { from: string; to: string } {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: toISO(first), to: todayISO() };
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`;
}

// ─── Display maps ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.NEW]:             "New",
  [WorkOrderStatus.ASSIGNED]:        "Assigned",
  [WorkOrderStatus.SCHEDULED]:       "Scheduled",
  [WorkOrderStatus.IN_PROGRESS]:     "In Progress",
  [WorkOrderStatus.ON_HOLD]:         "On Hold",
  [WorkOrderStatus.COMPLETED]:       "Completed",
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: "Needs Follow-up",
  [WorkOrderStatus.ESTIMATE_NEEDED]: "Estimate Needed",
  [WorkOrderStatus.CLOSED]:          "Closed",
  [WorkOrderStatus.CANCELLED]:       "Cancelled",
  [WorkOrderStatus.ARCHIVED]:        "Archived",
};

const STATUS_DOT: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.NEW]:             "bg-slate-400",
  [WorkOrderStatus.ASSIGNED]:        "bg-blue-500",
  [WorkOrderStatus.SCHEDULED]:       "bg-indigo-500",
  [WorkOrderStatus.IN_PROGRESS]:     "bg-brand-500",
  [WorkOrderStatus.ON_HOLD]:         "bg-amber-500",
  [WorkOrderStatus.COMPLETED]:       "bg-emerald-500",
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: "bg-orange-400",
  [WorkOrderStatus.ESTIMATE_NEEDED]: "bg-amber-400",
  [WorkOrderStatus.CLOSED]:          "bg-violet-400",
  [WorkOrderStatus.CANCELLED]:       "bg-slate-200",
  [WorkOrderStatus.ARCHIVED]:        "bg-slate-300",
};

const STATUS_BAR: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.NEW]:             "bg-slate-300",
  [WorkOrderStatus.ASSIGNED]:        "bg-blue-400",
  [WorkOrderStatus.SCHEDULED]:       "bg-indigo-400",
  [WorkOrderStatus.IN_PROGRESS]:     "bg-brand-500",
  [WorkOrderStatus.ON_HOLD]:         "bg-amber-500",
  [WorkOrderStatus.COMPLETED]:       "bg-emerald-500",
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: "bg-orange-400",
  [WorkOrderStatus.ESTIMATE_NEEDED]: "bg-amber-400",
  [WorkOrderStatus.CLOSED]:          "bg-violet-500",
  [WorkOrderStatus.CANCELLED]:       "bg-slate-200",
  [WorkOrderStatus.ARCHIVED]:        "bg-slate-300",
};

const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  [ServiceCategory.WEEKLY_POOL_MAINTENANCE]:    "Weekly Maintenance",
  [ServiceCategory.POOL_REPAIR]:                "Pool Repair",
  [ServiceCategory.POOL_INSPECTION_DIAGNOSTIC]: "Inspection / Diagnostic",
  [ServiceCategory.FILTER_CLEANING]:            "Filter Cleaning",
  [ServiceCategory.HEATER_SERVICE]:             "Heater Service",
  [ServiceCategory.EQUIPMENT_INSTALLATION]:     "Equipment Install",
  [ServiceCategory.POOL_REMODEL]:               "Pool Remodel",
  [ServiceCategory.NEW_CONSTRUCTION]:           "New Construction",
  [ServiceCategory.EMERGENCY_SERVICE]:          "Emergency Service",
  [ServiceCategory.OTHER]:                      "Other",
};

const CATEGORY_COLOR: Record<ServiceCategory, string> = {
  [ServiceCategory.WEEKLY_POOL_MAINTENANCE]:    "bg-brand-500",
  [ServiceCategory.POOL_REPAIR]:                "bg-blue-500",
  [ServiceCategory.POOL_INSPECTION_DIAGNOSTIC]: "bg-slate-500",
  [ServiceCategory.FILTER_CLEANING]:            "bg-teal-500",
  [ServiceCategory.HEATER_SERVICE]:             "bg-orange-500",
  [ServiceCategory.EQUIPMENT_INSTALLATION]:     "bg-violet-500",
  [ServiceCategory.POOL_REMODEL]:               "bg-purple-500",
  [ServiceCategory.NEW_CONSTRUCTION]:           "bg-amber-500",
  [ServiceCategory.EMERGENCY_SERVICE]:          "bg-red-500",
  [ServiceCategory.OTHER]:                      "bg-slate-400",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-slate-100", className)} />;
}

// ─── Mini bar (inline, fixed-width track) ─────────────────────────────────────

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 print:border print:border-slate-200 print:bg-white">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
    </div>
  );
}

// ─── Completion rate cell ─────────────────────────────────────────────────────

function CompletionRate({ rate, total }: { rate: number; total: number }) {
  if (total === 0) return <span className="text-xs text-slate-400">—</span>;
  const color =
    rate === 100 ? "text-emerald-600" :
    rate >= 75   ? "text-emerald-600" :
    rate >= 50   ? "text-amber-600"   :
                   "text-red-500";
  return (
    <div className="flex items-center gap-1.5">
      {rate === 100 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
      <span className={cn("text-sm font-semibold tabular-nums", color)}>{rate}%</span>
    </div>
  );
}

// ─── Tech initials avatar ─────────────────────────────────────────────────────

const AVATAR_PALETTES = [
  "bg-brand-100 text-brand-700",
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
  "bg-amber-100 text-amber-700",
];

function TechAvatar({ name }: { name: string }) {
  const initials = name === "Unassigned"
    ? "?"
    : name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const palette = AVATAR_PALETTES[
    name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_PALETTES.length
  ];
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        palette
      )}
    >
      {initials}
    </span>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
      <div className="border-b border-border px-6 py-4 print:border-slate-300">
        <h3 className="font-display text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Table primitives ─────────────────────────────────────────────────────────

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 print:border-slate-300",
        right ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  muted,
}: {
  children: React.ReactNode;
  right?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-b border-border px-4 py-3 text-sm print:border-slate-100",
        right ? "text-right tabular-nums" : "text-left",
        muted ? "text-slate-400" : "text-slate-700"
      )}
    >
      {children}
    </td>
  );
}

// ─── Loading skeletons ────────────────────────────────────────────────────────

function SummaryStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <Bone className="mb-2.5 h-2.5 w-20" />
          <Bone className="h-8 w-14" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }, (__, c) => (
            <Bone
              key={c}
              className={cn("h-3", c === 0 ? "w-32" : c === cols - 1 ? "w-20" : "w-12")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Status table ─────────────────────────────────────────────────────────────

function StatusTable({ rows, total }: { rows: StatusRow[]; total: number }) {
  const nonEmpty = rows.filter((r) => r.count > 0);
  const empty    = rows.filter((r) => r.count === 0);

  return (
    <table className="w-full">
      <thead>
        <tr className="bg-slate-50/60 print:bg-white">
          <Th>Status</Th>
          <Th right>Count</Th>
          <Th>Distribution</Th>
        </tr>
      </thead>
      <tbody>
        {nonEmpty.map((row) => (
          <tr key={row.status} className="hover:bg-slate-50/40 print:hover:bg-transparent">
            <Td>
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[row.status])} />
                {STATUS_LABEL[row.status]}
              </div>
            </Td>
            <Td right>
              <span className="font-semibold text-slate-900">{row.count}</span>
            </Td>
            <Td><MiniBar pct={row.pct} color={STATUS_BAR[row.status]} /></Td>
          </tr>
        ))}
        {empty.map((row) => (
          <tr key={row.status} className="opacity-40">
            <Td muted>
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[row.status])} />
                {STATUS_LABEL[row.status]}
              </div>
            </Td>
            <Td right muted>0</Td>
            <Td muted><MiniBar pct={0} color={STATUS_BAR[row.status]} /></Td>
          </tr>
        ))}
        <tr className="bg-slate-50/60 print:bg-slate-50">
          <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total
          </td>
          <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-slate-900">
            {total}
          </td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}

// ─── Category table ───────────────────────────────────────────────────────────

function CategoryTable({ rows, total }: { rows: CategoryRow[]; total: number }) {
  if (rows.length === 0) {
    return (
      <p className="px-6 py-8 text-center text-sm text-slate-400">
        No work orders in this date range
      </p>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="bg-slate-50/60 print:bg-white">
          <Th>Category</Th>
          <Th right>Jobs</Th>
          <Th right>Done</Th>
          <Th>Rate</Th>
          <Th>Share</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.category} className="hover:bg-slate-50/40 print:hover:bg-transparent">
            <Td>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    CATEGORY_COLOR[row.category]
                  )}
                />
                {CATEGORY_LABEL[row.category]}
              </div>
            </Td>
            <Td right>
              <span className="font-semibold text-slate-900">{row.count}</span>
            </Td>
            <Td right>{row.completed}</Td>
            <Td>
              <CompletionRate rate={row.completion_rate} total={row.count} />
            </Td>
            <Td>
              <MiniBar pct={row.pct} color={CATEGORY_COLOR[row.category]} />
            </Td>
          </tr>
        ))}
        <tr className="bg-slate-50/60 print:bg-slate-50">
          <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total
          </td>
          <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-slate-900">
            {total}
          </td>
          <td colSpan={3} />
        </tr>
      </tbody>
    </table>
  );
}

// ─── Technician table ─────────────────────────────────────────────────────────

function TechTable({ rows }: { rows: TechRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-6 py-8 text-center text-sm text-slate-400">
        No work orders in this date range
      </p>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="bg-slate-50/60 print:bg-white">
          <Th>Technician</Th>
          <Th right>Assigned</Th>
          <Th right>Completed</Th>
          <Th right>Pending</Th>
          <Th right>Cancelled</Th>
          <Th>Completion</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.technician_id ?? "__unassigned__"}
            className="hover:bg-slate-50/40 print:hover:bg-transparent"
          >
            <Td>
              <div className="flex items-center gap-2.5">
                <TechAvatar name={row.technician_name} />
                <span className={row.technician_id ? "text-slate-900" : "text-slate-400 italic"}>
                  {row.technician_name}
                </span>
              </div>
            </Td>
            <Td right>
              <span className="font-semibold text-slate-900">{row.total}</span>
            </Td>
            <Td right>
              <span className={row.completed > 0 ? "font-semibold text-emerald-600" : "text-slate-400"}>
                {row.completed}
              </span>
            </Td>
            <Td right>
              <span className={row.pending > 0 ? "font-medium text-amber-600" : "text-slate-400"}>
                {row.pending}
              </span>
            </Td>
            <Td right muted>{row.cancelled || "—"}</Td>
            <Td>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 print:border print:border-slate-200 print:bg-white">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${row.completion_rate}%` }}
                  />
                </div>
                <CompletionRate rate={row.completion_rate} total={row.total} />
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ report }: { report: RangeReport }) {
  const metrics = [
    { label: "Total Jobs", value: report.total_in_range, color: "text-slate-900" },
    { label: "Completed",  value: report.completed_in_range, color: "text-emerald-600" },
    {
      label: "Completion Rate",
      value: `${report.completion_rate}%`,
      color: report.completion_rate >= 75 ? "text-emerald-600"
           : report.completion_rate >= 50 ? "text-amber-600"
           : "text-red-500",
    },
    {
      label: "Pending",
      value: report.by_status
        .filter((r) =>
          [
            WorkOrderStatus.NEW,
            WorkOrderStatus.ASSIGNED,
            WorkOrderStatus.IN_PROGRESS,
            WorkOrderStatus.ESTIMATE_NEEDED,
            WorkOrderStatus.NEEDS_FOLLOW_UP,
          ].includes(r.status)
        )
        .reduce((s, r) => s + r.count, 0),
      color: "text-amber-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="rounded-xl border border-border bg-white px-5 py-4 shadow-sm print:rounded-none print:border print:border-slate-200 print:shadow-none"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {m.label}
          </p>
          <p className={cn("mt-1.5 font-display text-3xl font-bold tabular-nums", m.color)}>
            {m.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Date range picker ────────────────────────────────────────────────────────

type Preset = "week" | "month" | "custom";

interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  range: DateRange;
  preset: Preset;
  onPreset: (p: Preset) => void;
  onCustomChange: (r: DateRange) => void;
}

function DateRangePicker({
  range,
  preset,
  onPreset,
  onCustomChange,
}: DateRangePickerProps) {
  const PRESETS: { id: Preset; label: string }[] = [
    { id: "week",   label: "This Week"  },
    { id: "month",  label: "This Month" },
    { id: "custom", label: "Custom"     },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      {/* Segmented control */}
      <div className="flex overflow-hidden rounded-lg border border-border bg-white shadow-sm">
        {PRESETS.map((p, i) => (
          <button
            key={p.id}
            onClick={() => onPreset(p.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              i !== 0 && "border-l border-border",
              preset === p.id
                ? "bg-brand-500 text-white"
                : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => onCustomChange({ ...range, from: e.target.value })}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <span className="text-xs font-medium text-slate-400">to</span>
          <input
            type="date"
            value={range.to}
            min={range.from}
            max={todayISO()}
            onChange={(e) => onCustomChange({ ...range, to: e.target.value })}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
      )}

      {/* Range label */}
      {preset !== "custom" && range.from && range.to && (
        <span className="text-xs text-slate-400">
          {fmtDate(range.from)} — {fmtDate(range.to)}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReportsDashboard({ tenantId }: { tenantId: string }) {
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange]   = useState<DateRange>(getMonthRange);

  const reportUrl = useMemo(() => {
    const tid = encodeURIComponent(tenantId);
    return `/api/reports/range?tenant_id=${tid}&date_from=${range.from}&date_to=${range.to}`;
  }, [tenantId, range]);

  const { data: report, error, loading, retry } = useApiQuery<RangeReport>(reportUrl);

  function handlePreset(p: Preset) {
    setPreset(p);
    if (p === "week")  setRange(getWeekRange());
    if (p === "month") setRange(getMonthRange());
  }

  function handleCustomChange(r: DateRange) {
    if (r.from && r.to && r.from <= r.to) setRange(r);
  }

  return (
    <>
      {/* Print-only report header */}
      <div className="hidden print:block print:mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Showtime Pool Service · Operations Report
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
          Work Order Summary
        </h1>
        {range.from && range.to && (
          <p className="mt-0.5 text-sm text-slate-600">
            {fmtDate(range.from)} — {fmtDate(range.to)}
          </p>
        )}
        {report && (
          <p className="mt-0.5 text-xs text-slate-400">
            Generated {new Date(report.generated_at).toLocaleString()}
          </p>
        )}
        <hr className="mt-4 border-slate-200" />
      </div>

      <div className="space-y-6">
        {/* ── Controls bar ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <DateRangePicker
            range={range}
            preset={preset}
            onPreset={handlePreset}
            onCustomChange={handleCustomChange}
          />

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={retry}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
          </div>
        </div>

        {/* ── Error state ───────────────────────────────────────────────────── */}
        {error && <ErrorState message={error} onRetry={retry} />}

        {/* ── Summary strip ─────────────────────────────────────────────────── */}
        {loading ? (
          <SummaryStripSkeleton />
        ) : report ? (
          <SummaryStrip report={report} />
        ) : null}

        {/* ── Status + Category (side by side on lg) ────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
          <SectionCard
            title="Status Breakdown"
            subtitle="All work order statuses in the selected period"
          >
            {loading ? (
              <TableSkeleton rows={7} cols={3} />
            ) : report ? (
              <StatusTable rows={report.by_status} total={report.total_in_range} />
            ) : null}
          </SectionCard>

          <SectionCard
            title="Service Category Breakdown"
            subtitle="Jobs and completion rate by service type"
          >
            {loading ? (
              <TableSkeleton rows={5} cols={5} />
            ) : report ? (
              <CategoryTable rows={report.by_category} total={report.total_in_range} />
            ) : null}
          </SectionCard>
        </div>

        {/* ── Technician summary ────────────────────────────────────────────── */}
        <SectionCard
          title="Technician Completion Summary"
          subtitle="Jobs assigned, completed, pending, and cancelled per technician"
        >
          {loading ? (
            <TableSkeleton rows={4} cols={6} />
          ) : report ? (
            <TechTable rows={report.by_technician} />
          ) : null}
        </SectionCard>

        {/* ── Print footer ──────────────────────────────────────────────────── */}
        {report && (
          <p className="hidden text-right text-xs text-slate-400 print:block">
            Showtime Pool Service · Confidential · Page 1
          </p>
        )}
      </div>

      {/* Print-specific global styles */}
      <style>{`
        @media print {
          @page { margin: 1.5cm; size: A4 portrait; }
          body  { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>
    </>
  );
}
