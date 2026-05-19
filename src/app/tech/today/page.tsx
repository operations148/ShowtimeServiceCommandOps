import type { Metadata } from "next";
import Link from "next/link";
import {
  MapPin,
  Clock,
  ChevronRight,
  Wrench,
  Droplets,
  AlertTriangle,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/config";
import { listWorkOrders } from "@/lib/db/queries/work-orders";
import { cn } from "@/lib/utils";
import {
  WorkOrderStatus,
  Priority,
  ServiceCategory,
  type WorkOrderWithRelations,
} from "@/types/work-order";

export const metadata: Metadata = { title: "Today's Jobs" };

// ─── Label maps ───────────────────────────────────────────────────────────────

const SERVICE_LABEL: Record<ServiceCategory, string> = {
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

const STATUS_CONFIG: Record<
  WorkOrderStatus,
  { label: string; badge: string; icon: React.ElementType }
> = {
  [WorkOrderStatus.NEW]:             { label: "Scheduled",       badge: "bg-slate-100 text-slate-600",    icon: Clock         },
  [WorkOrderStatus.ASSIGNED]:        { label: "Scheduled",       badge: "bg-slate-100 text-slate-600",    icon: Clock         },
  [WorkOrderStatus.IN_PROGRESS]:     { label: "In Progress",     badge: "bg-brand-50 text-brand-700",     icon: Wrench        },
  [WorkOrderStatus.COMPLETED]:       { label: "Completed",       badge: "bg-emerald-50 text-emerald-700", icon: CheckCircle2  },
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: { label: "Follow-up",       badge: "bg-purple-50 text-purple-700",   icon: AlertTriangle },
  [WorkOrderStatus.ESTIMATE_NEEDED]: { label: "Estimate Needed", badge: "bg-amber-50 text-amber-700",     icon: AlertTriangle },
  [WorkOrderStatus.CANCELLED]:       { label: "Cancelled",       badge: "bg-red-50 text-red-600",         icon: AlertTriangle },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; bar: string; badge: string }> = {
  [Priority.LOW]:    { label: "",       bar: "",             badge: ""                            },
  [Priority.NORMAL]: { label: "",       bar: "",             badge: ""                            },
  [Priority.HIGH]:   { label: "High",   bar: "bg-amber-400", badge: "bg-amber-50 text-amber-700"  },
  [Priority.URGENT]: { label: "Urgent", bar: "bg-red-500",   badge: "bg-red-50 text-red-600"      },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(hhmm?: string): { time: string; ampm: string } | null {
  if (!hhmm) return null;
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { time: `${h12}:${String(m).padStart(2, "0")}`, ampm };
}

function splitAddress(full: string): { street: string; cityState: string } {
  const idx = full.indexOf(",");
  if (idx === -1) return { street: full, cityState: "" };
  return { street: full.slice(0, idx).trim(), cityState: full.slice(idx + 1).trim() };
}

// ─── Date Header ──────────────────────────────────────────────────────────────

function DateHeader({ jobs }: { jobs: WorkOrderWithRelations[] }) {
  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const completed = jobs.filter((j) => j.status === WorkOrderStatus.COMPLETED).length;

  return (
    <div className="bg-white px-4 pb-4 pt-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{dayName}</p>
      <h1 className="font-display text-xl font-bold text-slate-900">{dateStr}</h1>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1">
          <Droplets className="h-3.5 w-3.5 text-brand-500" />
          <span className="text-xs font-semibold text-brand-700">{jobs.length} jobs today</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-semibold text-emerald-700">{completed} completed</span>
        </div>
      </div>
    </div>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({ job }: { job: WorkOrderWithRelations }) {
  const status   = STATUS_CONFIG[job.status];
  const priority = PRIORITY_CONFIG[job.priority];
  const StatusIcon = status.icon;
  const isInProgress = job.status === WorkOrderStatus.IN_PROGRESS;
  const isUrgent     = job.priority === Priority.URGENT;

  const timeInfo = formatTime(job.scheduled_time_start);
  const { street, cityState } = splitAddress(job.property_address);
  const ctaLabel = isInProgress ? "Continue Job" : "Start Job";

  return (
    <Link
      href={`/tech/job/${job.id}`}
      className={cn(
        "relative block overflow-hidden rounded-2xl bg-white shadow-sm",
        "transition-shadow active:shadow-md",
        isInProgress && "ring-2 ring-brand-400 ring-offset-1"
      )}
    >
      {priority.bar && (
        <span className={cn("absolute left-0 top-0 h-full w-1 rounded-l-2xl", priority.bar)} />
      )}

      <div className="flex min-h-[88px] items-start gap-3.5 pl-5 pr-4 pt-4 pb-4">
        <div className="flex w-14 shrink-0 flex-col items-center pt-0.5 text-center">
          {timeInfo ? (
            <>
              <span className="font-display text-base font-bold leading-tight text-slate-900">
                {timeInfo.time}
              </span>
              <span className="text-[10px] font-medium uppercase text-slate-400">
                {timeInfo.ampm}
              </span>
            </>
          ) : (
            <span className="text-xs font-medium text-slate-400">TBD</span>
          )}
        </div>

        <div className="mt-1 flex w-px self-stretch flex-col items-center">
          <div
            className={cn(
              "h-2.5 w-2.5 rounded-full border-2",
              isInProgress
                ? "border-brand-500 bg-brand-500"
                : isUrgent
                  ? "border-red-500 bg-red-500"
                  : "border-slate-300 bg-white"
            )}
          />
          <div className="w-px flex-1 bg-slate-200" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                status.badge
              )}
            >
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </span>
            {priority.label && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  priority.badge
                )}
              >
                {isUrgent && <Zap className="h-2.5 w-2.5" />}
                {priority.label}
              </span>
            )}
          </div>

          <p className="mt-1.5 font-display text-base font-bold text-slate-900">
            {job.property_customer_name}
            <span className="font-normal text-slate-400"> · </span>
            {SERVICE_LABEL[job.service_category]}
          </p>

          <div className="mt-1 flex items-start gap-1">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <div>
              <p className="text-sm text-slate-700">{street}</p>
              <p className="text-xs text-slate-400">{cityState}</p>
            </div>
          </div>

          <p className="mt-1.5 text-[11px] font-medium text-slate-400">{job.wo_number}</p>
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-0">
        <div
          className={cn(
            "flex w-full items-center justify-between py-3.5 text-sm font-semibold",
            isInProgress ? "text-brand-600" : "text-slate-700"
          )}
        >
          <span>{ctaLabel}</span>
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              isInProgress ? "bg-brand-500" : "bg-slate-900"
            )}
          >
            <ChevronRight className="h-4 w-4 text-white" />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TERMINAL = new Set([WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED]);

export default async function TechTodayPage() {
  const session = await getServerSession(authOptions);
  const tenantId = session?.user.tenant_id ?? "tenant-showtime";
  const technicianId = session?.user.technician_id;
  const today = new Date().toISOString().slice(0, 10);

  const allWos = await listWorkOrders({
    tenant_id:     tenantId,
    technician_id: technicianId,
  });

  const activeWos = allWos.filter((wo) => !TERMINAL.has(wo.status));

  const overdueJobs = activeWos
    .filter((wo) => wo.scheduled_date && wo.scheduled_date < today)
    .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""));

  const todayJobs = activeWos
    .filter((wo) => wo.scheduled_date === today || !wo.scheduled_date)
    .sort((a, b) =>
      (a.scheduled_time_start ?? "99:99").localeCompare(b.scheduled_time_start ?? "99:99")
    );

  const allVisible = [...overdueJobs, ...todayJobs];

  return (
    <div className="flex flex-col">
      <DateHeader jobs={allVisible} />

      <div className="space-y-3 px-4 pb-8 pt-4">
        {overdueJobs.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-1 pt-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                Overdue — {overdueJobs.length} job{overdueJobs.length !== 1 ? "s" : ""}
              </span>
            </div>
            {overdueJobs.map((job) => <JobCard key={job.id} job={job} />)}
            <div className="flex items-center gap-3 px-2 pt-1">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium text-slate-400">Today</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}

        {todayJobs.length === 0 && overdueJobs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-300" />
            <p className="text-sm font-medium text-slate-500">No jobs scheduled for today</p>
          </div>
        ) : todayJobs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-300" />
            <p className="text-sm font-medium text-slate-500">Nothing else scheduled today</p>
          </div>
        ) : (
          todayJobs.map((job) => <JobCard key={job.id} job={job} />)
        )}

        <div className="flex items-center gap-3 px-2 pt-2">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium text-slate-400">End of day</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
      </div>
    </div>
  );
}
