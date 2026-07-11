"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, UserPlus, CalendarClock, CheckCircle2, Camera, ClipboardList } from "lucide-react";
import { VisitStatus, type VisitWithSchedule } from "@/types/visit";
import type { ScheduleEvent } from "@/types/scheduling";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/ui/ErrorState";
import { AssignVisitModal } from "./schedule/AssignVisitModal";
import { RescheduleModal } from "./schedule/RescheduleModal";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  skipped: "bg-slate-100 text-slate-500 border-slate-200",
  rescheduled: "bg-violet-50 text-violet-700 border-violet-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

function when(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";
}

export function VisitAdminDetailClient({ id }: { id: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const perms = role ? rolePermissions[role] : undefined;

  const [visit, setVisit] = useState<VisitWithSchedule | null>(null);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assign, setAssign] = useState(false);
  const [reschedule, setReschedule] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vr, ar] = await Promise.all([
        fetch(`/api/visits/${id}/detail`),
        fetch(`/api/visits/${id}/activity`),
      ]);
      const vj = (await vr.json()) as { data?: VisitWithSchedule; error?: string };
      if (!vr.ok || !vj.data) { setError(vj.error ?? "Failed to load visit"); setLoading(false); return; }
      setVisit(vj.data);
      setEvents(((await ar.json()) as { data?: ScheduleEvent[] }).data ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (error || !visit) return <div className="mx-auto max-w-4xl"><ErrorState message={error ?? "Not found"} onRetry={load} /></div>;

  const checklistDone = visit.checklist.filter((c) => c.completed).length;
  const canManage = perms?.canManageSchedule ?? false;
  const canAssign = perms?.canAssignTechnicians ?? false;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumb items={[{ label: "Visits", href: "/dashboard/visits" }, { label: visit.work_order_title ?? "Visit" }]} className="mb-2" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl font-bold text-slate-900">{visit.work_order_title ?? "Visit"}</h2>
            <span className={cn("inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_BADGE[visit.status])}>{visit.status.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {visit.scheduled_date} · {visit.property_customer_name ?? ""}{visit.property_address ? ` · ${visit.property_address}` : ""}
          </p>
          <Link href={`/dashboard/work-orders/${visit.work_order_id}`} className="mt-1 inline-block text-sm font-medium text-brand-700 hover:underline">
            View work order →
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAssign && (
            <button type="button" onClick={() => setAssign(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"><UserPlus className="h-4 w-4" /> Assign</button>
          )}
          {canManage && (
            <button type="button" onClick={() => setReschedule(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"><CalendarClock className="h-4 w-4" /> Reschedule</button>
          )}
        </div>
      </div>

      {/* Schedule summary */}
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-white p-5 shadow-sm sm:grid-cols-4">
        <Field label="Scheduled" value={visit.all_day ? "All day" : visit.arrival_window_start ? `${visit.arrival_window_start}${visit.arrival_window_end ? `–${visit.arrival_window_end}` : ""}` : "No time set"} />
        <Field label="Duration" value={visit.estimated_duration_minutes ? `${visit.estimated_duration_minutes} min` : "—"} />
        <Field label="Lead tech" value={visit.assignments?.find((a) => a.role === "lead")?.name ?? (visit.technician_id ? "Assigned" : "Unassigned")} />
        <Field label="Crew" value={String((visit.assignments ?? []).length || (visit.technician_id ? 1 : 0))} />
        {visit.actual_start_at && <Field label="Actual start" value={when(visit.actual_start_at)} />}
        {visit.completed_at && <Field label="Completed" value={when(visit.completed_at)} />}
        {visit.reschedule_reason && <Field label="Last reschedule" value={visit.reschedule_reason} />}
        {visit.estimate_flagged && <Field label="Estimate" value="Flagged" />}
      </div>

      {/* Checklist + notes + photos */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><ClipboardList className="h-4 w-4" /> Checklist ({checklistDone}/{visit.checklist.length})</h3>
          {visit.checklist.length === 0 ? (
            <p className="text-sm text-slate-400">No checklist.</p>
          ) : (
            <ul className="space-y-1.5">
              {visit.checklist.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className={cn("h-4 w-4", c.completed ? "text-emerald-500" : "text-slate-300")} />
                  <span className={c.completed ? "text-slate-700" : "text-slate-400"}>{c.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <h3 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><Camera className="h-4 w-4" /> Photos ({visit.photo_urls.length})</h3>
          {visit.photo_urls.length === 0 ? (
            <p className="text-sm text-slate-400">No photos yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {visit.photo_urls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="Visit" className="aspect-square w-full rounded-lg object-cover" />
              ))}
            </div>
          )}
          {visit.technician_notes && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Technician notes</p>
              <p className="whitespace-pre-line text-sm text-slate-600">{visit.technician_notes}</p>
            </div>
          )}
          {visit.completion_message && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Completion</p>
              <p className="text-sm text-slate-600">{visit.completion_message}{visit.completed_by_name ? ` — ${visit.completed_by_name}` : ""}</p>
            </div>
          )}
        </div>
      </div>

      {/* Audit / schedule history */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Schedule history</h3>
        <ul className="space-y-2">
          {events.length === 0 && <li className="text-sm text-slate-400">No schedule changes recorded.</li>}
          {events.map((ev) => (
            <li key={ev.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white px-4 py-2.5 text-sm">
              <div>
                <span className="font-medium text-slate-700">{ev.event_type.replace(/_/g, " ")}</span>
                {ev.reason && <span className="text-slate-400"> · {ev.reason}</span>}
              </div>
              <span className="shrink-0 text-xs text-slate-400">{when(ev.created_at)}</span>
            </li>
          ))}
        </ul>
      </div>

      {assign && <AssignVisitModal visit={visit} onClose={() => setAssign(false)} onDone={() => { setAssign(false); void load(); }} />}
      {reschedule && <RescheduleModal visit={visit} onClose={() => setReschedule(false)} onDone={() => { setReschedule(false); void load(); }} />}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
