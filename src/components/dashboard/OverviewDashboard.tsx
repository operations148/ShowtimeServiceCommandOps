"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ClipboardList,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Clock,
  ChevronRight,
} from "lucide-react";
// AlertTriangle still used in the overdue section below
import { StatCard } from "@/components/dashboard/StatCard";
import { cn } from "@/lib/utils";
import { WorkOrderStatus, ServiceCategory } from "@/types/work-order";
import type { WorkOrderWithRelations } from "@/types/work-order";
import type { DashboardSummary } from "@/app/api/reports/summary/route";
import { useApiQuery } from "@/lib/utils/useApiQuery";
import { ErrorStateFull } from "@/components/ui/ErrorState";

// ─── Constants ────────────────────────────────────────────────────────────────

const NON_OVERDUE = new Set<WorkOrderStatus>([
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.CANCELLED,
]);

// Ordered by operational priority for the breakdown chart
const STATUS_ORDER: WorkOrderStatus[] = [
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.NEW,
  WorkOrderStatus.ESTIMATE_NEEDED,
  WorkOrderStatus.NEEDS_FOLLOW_UP,
  WorkOrderStatus.COMPLETED,
  WorkOrderStatus.CANCELLED,
];

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.NEW]:            "New",
  [WorkOrderStatus.ASSIGNED]:       "Assigned",
  [WorkOrderStatus.SCHEDULED]:      "Scheduled",
  [WorkOrderStatus.IN_PROGRESS]:    "In Progress",
  [WorkOrderStatus.ON_HOLD]:        "On Hold",
  [WorkOrderStatus.COMPLETED]:      "Completed",
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: "Follow-up",
  [WorkOrderStatus.ESTIMATE_NEEDED]: "Estimate Needed",
  [WorkOrderStatus.CLOSED]:         "Closed",
  [WorkOrderStatus.CANCELLED]:      "Cancelled",
  [WorkOrderStatus.ARCHIVED]:       "Archived",
};

const STATUS_BAR_COLOR: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.NEW]:            "bg-slate-400",
  [WorkOrderStatus.ASSIGNED]:       "bg-blue-500",
  [WorkOrderStatus.SCHEDULED]:      "bg-indigo-500",
  [WorkOrderStatus.IN_PROGRESS]:    "bg-brand-500",
  [WorkOrderStatus.ON_HOLD]:        "bg-amber-500",
  [WorkOrderStatus.COMPLETED]:      "bg-emerald-500",
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: "bg-orange-400",
  [WorkOrderStatus.ESTIMATE_NEEDED]: "bg-amber-400",
  [WorkOrderStatus.CLOSED]:         "bg-violet-500",
  [WorkOrderStatus.CANCELLED]:      "bg-slate-200",
  [WorkOrderStatus.ARCHIVED]:       "bg-slate-300",
};

const STATUS_DOT: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.NEW]:            "bg-slate-400",
  [WorkOrderStatus.ASSIGNED]:       "bg-blue-500",
  [WorkOrderStatus.SCHEDULED]:      "bg-indigo-500",
  [WorkOrderStatus.IN_PROGRESS]:    "bg-brand-500",
  [WorkOrderStatus.ON_HOLD]:        "bg-amber-500",
  [WorkOrderStatus.COMPLETED]:      "bg-emerald-500",
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: "bg-orange-400",
  [WorkOrderStatus.ESTIMATE_NEEDED]: "bg-amber-400",
  [WorkOrderStatus.CLOSED]:         "bg-violet-400",
  [WorkOrderStatus.CANCELLED]:      "bg-slate-300",
  [WorkOrderStatus.ARCHIVED]:       "bg-slate-300",
};

const STATUS_BADGE: Record<WorkOrderStatus, string> = {
  [WorkOrderStatus.NEW]:            "bg-slate-100 text-slate-600",
  [WorkOrderStatus.ASSIGNED]:       "bg-blue-50 text-blue-700",
  [WorkOrderStatus.SCHEDULED]:      "bg-indigo-50 text-indigo-700",
  [WorkOrderStatus.IN_PROGRESS]:    "bg-brand-50 text-brand-700",
  [WorkOrderStatus.ON_HOLD]:        "bg-amber-50 text-amber-700",
  [WorkOrderStatus.COMPLETED]:      "bg-emerald-50 text-emerald-700",
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: "bg-orange-50 text-orange-700",
  [WorkOrderStatus.ESTIMATE_NEEDED]: "bg-amber-50 text-amber-700",
  [WorkOrderStatus.CLOSED]:         "bg-violet-50 text-violet-700",
  [WorkOrderStatus.CANCELLED]:      "bg-red-50 text-red-500",
  [WorkOrderStatus.ARCHIVED]:       "bg-slate-100 text-slate-400",
};

const CATEGORY_SHORT: Record<ServiceCategory, string> = {
  [ServiceCategory.WEEKLY_POOL_MAINTENANCE]:   "Weekly Maintenance",
  [ServiceCategory.POOL_REPAIR]:               "Pool Repair",
  [ServiceCategory.POOL_INSPECTION_DIAGNOSTIC]: "Inspection",
  [ServiceCategory.FILTER_CLEANING]:           "Filter Clean",
  [ServiceCategory.HEATER_SERVICE]:            "Heater Service",
  [ServiceCategory.EQUIPMENT_INSTALLATION]:    "Equip. Install",
  [ServiceCategory.POOL_REMODEL]:              "Pool Remodel",
  [ServiceCategory.NEW_CONSTRUCTION]:          "New Construction",
  [ServiceCategory.EMERGENCY_SERVICE]:         "Emergency",
  [ServiceCategory.OTHER]:                     "Other",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getDisplayDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(hhmm: string | undefined): string {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function daysOverdue(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.max(1, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
}

// ─── Skeleton primitives ──────────────────────────────────────────────────────

function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-100", className)} />;
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border border-t-2 border-t-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          <Bone className="h-2.5 w-20" />
          <Bone className="h-8 w-12" />
          <Bone className="h-2.5 w-28" />
        </div>
        <Bone className="h-10 w-10 shrink-0 rounded-lg" />
      </div>
    </div>
  );
}

function JobRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <Bone className="h-3.5 w-14 shrink-0" />
      <Bone className="h-2 w-2 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Bone className="h-3 w-3/4" />
        <Bone className="h-2.5 w-1/2" />
      </div>
      <Bone className="h-5 w-20 shrink-0 rounded-full" />
    </div>
  );
}

function BarRowSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Bone className="h-2 w-2 shrink-0 rounded-full" />
      <Bone className="h-2.5 w-24 shrink-0" />
      <Bone className="h-1.5 flex-1 rounded-full" />
      <Bone className="h-2.5 w-4 shrink-0" />
    </div>
  );
}

function AlertRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <Bone className="h-5 w-14 shrink-0 rounded-md" />
      <div className="flex-1 space-y-1.5">
        <Bone className="h-3 w-2/3" />
        <Bone className="h-2.5 w-1/2" />
      </div>
      <Bone className="h-5 w-20 shrink-0 rounded-full" />
    </div>
  );
}

// ─── Status bar ───────────────────────────────────────────────────────────────

interface StatusBarProps {
  status: WorkOrderStatus;
  count: number;
  total: number;
  animated: boolean;
}

function StatusBar({ status, count, total, animated }: StatusBarProps) {
  const ratio = total > 0 ? count / total : 0;

  return (
    <div className="flex items-center gap-3">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[status])} />
      <span className="w-[112px] shrink-0 truncate text-xs font-medium text-slate-600">
        {STATUS_LABEL[status]}
      </span>
      <div className="flex-1 overflow-hidden rounded-full bg-slate-100" style={{ height: "6px" }}>
        <div
          className={cn(
            "h-full w-full origin-left rounded-full",
            STATUS_BAR_COLOR[status],
            "transition-transform duration-700 ease-out"
          )}
          style={{ transform: `scaleX(${animated ? ratio : 0})` }}
        />
      </div>
      <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">
        {count}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OverviewDashboard() {
  const summaryQuery = useApiQuery<DashboardSummary>("/api/reports/summary");
  const woQuery      = useApiQuery<WorkOrderWithRelations[]>("/api/work-orders");

  const summary    = summaryQuery.data;
  const workOrders = woQuery.data ?? [];
  const loading    = summaryQuery.loading || woQuery.loading;
  const error      = summaryQuery.error ?? woQuery.error;
  const retry      = () => { summaryQuery.retry(); woQuery.retry(); };

  const [barsAnimated, setBarsAnimated] = useState(false);
  const today = useMemo(todayISO, []);

  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setBarsAnimated(true))
      );
    } else {
      setBarsAnimated(false);
    }
  }, [loading]);

  const todaysJobs = useMemo(
    () =>
      workOrders
        .filter((wo) => wo.scheduled_date === today)
        .sort((a, b) =>
          (a.scheduled_time_start ?? "99:99").localeCompare(
            b.scheduled_time_start ?? "99:99"
          )
        )
        .slice(0, 5),
    [workOrders, today]
  );

  const overdueJobs = useMemo(
    () =>
      workOrders
        .filter(
          (wo) =>
            wo.scheduled_date !== undefined &&
            wo.scheduled_date < today &&
            !NON_OVERDUE.has(wo.status)
        )
        .sort((a, b) =>
          (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? "")
        ),
    [workOrders, today]
  );

  // ── Completion rate label ────────────────────────────────────────────────────
  const completionTrend = (() => {
    if (!summary || summary.total_today === 0) return "No jobs today";
    const pct = Math.round((summary.completed_today / summary.total_today) * 100);
    return `${pct}% of today's jobs`;
  })();

  if (error) {
    return <ErrorStateFull message={error} onRetry={retry} />;
  }

  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900">
          {getGreeting()}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {getDisplayDate()} · Showtime Pool Service
        </p>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Jobs Today"
              value={summary?.total_today ?? 0}
              icon={ClipboardList}
              accent="brand"
              trend={{ value: "Scheduled for today", direction: "neutral" }}
            />
            <StatCard
              label="Completed"
              value={summary?.completed_today ?? 0}
              icon={CheckCircle2}
              accent="green"
              trend={{ value: completionTrend, direction: "neutral" }}
            />
            <StatCard
              label="Open Estimates"
              value={summary?.open_estimates ?? 0}
              icon={FileText}
              accent="amber"
              trend={{
                value: "Awaiting approval",
                direction: (summary?.open_estimates ?? 0) > 0 ? "down" : "neutral",
              }}
            />
            <StatCard
              label="Overdue"
              value={summary?.overdue ?? 0}
              icon={AlertTriangle}
              accent="red"
              trend={{
                value:
                  (summary?.overdue ?? 0) === 0
                    ? "All jobs on track"
                    : "Requires attention",
                direction: (summary?.overdue ?? 0) > 0 ? "down" : "neutral",
              }}
            />
          </>
        )}
      </div>

      {/* ── Middle row: today's jobs + status chart ──────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Today's job list */}
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-500" />
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Today&apos;s Schedule
              </h3>
            </div>
            {!loading && (
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                {summary?.total_today ?? 0} total
              </span>
            )}
          </div>

          {loading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }, (_, i) => <JobRowSkeleton key={i} />)}
            </div>
          ) : todaysJobs.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-400">No jobs scheduled for today</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {todaysJobs.map((wo) => (
                <Link
                  key={wo.id}
                  href={`/dashboard/work-orders/${wo.id}`}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
                >
                  <span className="w-16 shrink-0 text-right font-mono text-xs text-slate-400">
                    {formatTime(wo.scheduled_time_start)}
                  </span>
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      STATUS_DOT[wo.status]
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {wo.property_address.split(",")[0]}
                      <span className="ml-1.5 text-xs font-normal text-slate-400">
                        {wo.property_address.split(",").slice(1).join(",").trim()}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {CATEGORY_SHORT[wo.service_category]}
                      {" · "}
                      {wo.assigned_technician_name ?? "Unassigned"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      STATUS_BADGE[wo.status]
                    )}
                  >
                    {STATUS_LABEL[wo.status]}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
              {(summary?.total_today ?? 0) > 5 && (
                <Link
                  href="/dashboard/work-orders"
                  className="flex items-center justify-center gap-1.5 px-5 py-3 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50"
                >
                  View all {summary?.total_today} jobs
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Status Breakdown
            </h3>
            {!loading && (
              <p className="mt-0.5 text-xs text-slate-400">
                {summary?.total_work_orders ?? 0} total work orders
              </p>
            )}
          </div>

          <div className="px-5 py-4">
            {loading ? (
              <div className="space-y-3.5">
                {Array.from({ length: 7 }, (_, i) => <BarRowSkeleton key={i} />)}
              </div>
            ) : (
              <div className="space-y-3.5">
                {STATUS_ORDER.map((status) => (
                  <StatusBar
                    key={status}
                    status={status}
                    count={summary?.by_status[status] ?? 0}
                    total={summary?.total_work_orders ?? 1}
                    animated={barsAnimated}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Overdue alerts ───────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Overdue Jobs
            </h3>
          </div>
          {!loading && overdueJobs.length > 0 && (
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
              {overdueJobs.length} requiring attention
            </span>
          )}
        </div>

        {loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }, (_, i) => <AlertRowSkeleton key={i} />)}
          </div>
        ) : overdueJobs.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-8">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <p className="text-sm text-slate-400">No overdue jobs — all clear</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {overdueJobs.map((wo) => {
              const days = daysOverdue(wo.scheduled_date!);
              return (
                <Link
                  key={wo.id}
                  href={`/dashboard/work-orders/${wo.id}`}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-red-50/40"
                >
                  <span className="shrink-0 rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold tabular-nums text-red-700">
                    {days}d ago
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {wo.title}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {wo.property_address.split(",")[0]}
                      {" · "}
                      {wo.assigned_technician_name ?? "Unassigned"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      STATUS_BADGE[wo.status]
                    )}
                  >
                    {STATUS_LABEL[wo.status]}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
