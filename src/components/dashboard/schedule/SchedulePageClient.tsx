"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, AlertTriangle, UserPlus, CalendarClock, Loader2, Inbox } from "lucide-react";
import type { VisitWithSchedule } from "@/types/visit";
import { VisitStatus } from "@/types/visit";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/ui/ErrorState";
import { addDaysToDateStr, dayOfWeekOfDateStr } from "@/lib/scheduling/timezone";
import { AssignVisitModal } from "./AssignVisitModal";
import { RescheduleModal } from "./RescheduleModal";
import { cn } from "@/lib/utils";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDayHeader(dateStr: string): { dow: string; day: string } {
  const dow = DOW_LABELS[dayOfWeekOfDateStr(dateStr)];
  return { dow, day: dateStr.slice(8, 10) };
}

/** Sunday of the week containing dateStr. */
function weekStart(dateStr: string): string {
  return addDaysToDateStr(dateStr, -dayOfWeekOfDateStr(dateStr));
}

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-blue-400",
  in_progress: "bg-amber-400",
  completed: "bg-emerald-400",
  skipped: "bg-slate-300",
  rescheduled: "bg-violet-400",
  cancelled: "bg-red-300",
};

export function SchedulePageClient({ initialToday }: { initialToday: string }) {
  const [view, setView] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState(initialToday);
  const [visits, setVisits] = useState<VisitWithSchedule[]>([]);
  const [unassigned, setUnassigned] = useState<VisitWithSchedule[]>([]);
  const [overdue, setOverdue] = useState<VisitWithSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<VisitWithSchedule | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<VisitWithSchedule | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    const start = weekStart(anchor);
    return Array.from({ length: 7 }, (_, i) => addDaysToDateStr(start, i));
  }, [view, anchor]);

  const rangeFrom = days[0];
  const rangeTo = days[days.length - 1];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feedRes, unRes, ovRes] = await Promise.all([
        fetch(`/api/schedule?from=${rangeFrom}&to=${rangeTo}`),
        fetch(`/api/schedule?from=${rangeFrom}&to=${rangeTo}&scope=unassigned`),
        fetch(`/api/schedule?from=${addDaysToDateStr(initialToday, -60)}&to=${addDaysToDateStr(initialToday, -1)}&scope=overdue`),
      ]);
      const feed = (await feedRes.json()) as { data?: VisitWithSchedule[]; error?: string };
      if (!feedRes.ok) { setError(feed.error ?? "Failed to load schedule"); setLoading(false); return; }
      setVisits(feed.data ?? []);
      setUnassigned(((await unRes.json()) as { data?: VisitWithSchedule[] }).data ?? []);
      setOverdue(((await ovRes.json()) as { data?: VisitWithSchedule[] }).data ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo, initialToday]);

  useEffect(() => { void load(); }, [load]);

  // Conflict detection: a technician double-booked on the same day (client-side
  // warning only — never blocks).
  const conflictVisitIds = useMemo(() => {
    const set = new Set<string>();
    const byTechDay = new Map<string, VisitWithSchedule[]>();
    for (const v of visits) {
      if (!v.technician_id || v.status === VisitStatus.CANCELLED || v.status === VisitStatus.SKIPPED) continue;
      const key = `${v.technician_id}|${v.scheduled_date}`;
      const list = byTechDay.get(key) ?? [];
      list.push(v);
      byTechDay.set(key, list);
    }
    for (const list of byTechDay.values()) {
      if (list.length > 1) list.forEach((v) => set.add(v.id));
    }
    return set;
  }, [visits]);

  const visitsByDay = useMemo(() => {
    const map = new Map<string, VisitWithSchedule[]>();
    for (const v of visits) {
      const list = map.get(v.scheduled_date) ?? [];
      list.push(v);
      map.set(v.scheduled_date, list);
    }
    return map;
  }, [visits]);

  async function dropOnDay(dateStr: string) {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const visit = [...visits, ...unassigned].find((v) => v.id === id);
    if (!visit || visit.scheduled_date === dateStr) return;
    try {
      const res = await fetch(`/api/visits/${id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: visit.version, scheduled_date: dateStr, all_day: visit.all_day, reason: "Drag reschedule" }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setBanner(j.error ?? "Reschedule failed");
      }
      await load();
    } catch {
      setBanner("Reschedule failed");
    }
  }

  function shift(delta: number) {
    setAnchor((a) => addDaysToDateStr(a, view === "day" ? delta : delta * 7));
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: "Dispatch" }]} className="mb-2" />
          <h2 className="font-display text-2xl font-bold text-slate-900">Dispatch &amp; Calendar</h2>
          <p className="mt-1 text-sm text-slate-500">Assign, reschedule, and track field visits. GHL remains the source of truth for original customer booking.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button type="button" onClick={() => setView("day")} className={cn("px-3 py-1.5 text-sm font-semibold", view === "day" ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>Day</button>
            <button type="button" onClick={() => setView("week")} className={cn("px-3 py-1.5 text-sm font-semibold", view === "week" ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>Week</button>
          </div>
          <button type="button" onClick={() => shift(-1)} className="rounded-lg border border-border bg-white p-2 text-slate-600 hover:bg-slate-50" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setAnchor(initialToday)} className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Today</button>
          <button type="button" onClick={() => shift(1)} className="rounded-lg border border-border bg-white p-2 text-slate-600 hover:bg-slate-50" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {banner && <ErrorState message={banner} onRetry={() => setBanner(null)} />}
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
          {/* Calendar grid */}
          <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <div className={cn("grid min-w-[640px]", view === "day" ? "grid-cols-1" : "grid-cols-7")}>
              {days.map((d) => {
                const { dow, day } = formatDayHeader(d);
                const isToday = d === initialToday;
                const dayVisits = (visitsByDay.get(d) ?? []).sort((a, b) => (a.route_order ?? 999) - (b.route_order ?? 999));
                return (
                  <div
                    key={d}
                    className="min-h-[220px] border-b border-r border-border last:border-r-0"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOnDay(d)}
                  >
                    <div className={cn("sticky top-0 flex items-center justify-between border-b border-border px-3 py-2", isToday ? "bg-brand-50" : "bg-slate-50")}>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{dow}</span>
                      <span className={cn("text-sm font-bold", isToday ? "text-brand-700" : "text-slate-700")}>{day}</span>
                    </div>
                    <div className="space-y-2 p-2">
                      {loading ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>
                      ) : dayVisits.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-300">—</p>
                      ) : (
                        dayVisits.map((v) => (
                          <VisitCard
                            key={v.id}
                            visit={v}
                            conflict={conflictVisitIds.has(v.id)}
                            onDragStart={() => setDragId(v.id)}
                            onAssign={() => setAssignFor(v)}
                            onReschedule={() => setRescheduleFor(v)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side panels */}
          <div className="space-y-6">
            <SidePanel title="Unassigned" icon={Inbox} count={unassigned.length}>
              {unassigned.map((v) => (
                <VisitCard key={v.id} visit={v} compact onDragStart={() => setDragId(v.id)} onAssign={() => setAssignFor(v)} onReschedule={() => setRescheduleFor(v)} />
              ))}
              {unassigned.length === 0 && <p className="py-3 text-center text-xs text-slate-400">Everything in view is assigned.</p>}
            </SidePanel>
            <SidePanel title="Overdue" icon={AlertTriangle} count={overdue.length} accent="text-amber-600">
              {overdue.map((v) => (
                <VisitCard key={v.id} visit={v} compact onAssign={() => setAssignFor(v)} onReschedule={() => setRescheduleFor(v)} />
              ))}
              {overdue.length === 0 && <p className="py-3 text-center text-xs text-slate-400">No overdue visits. 🎉</p>}
            </SidePanel>
          </div>
        </div>
      )}

      {assignFor && <AssignVisitModal visit={assignFor} onClose={() => setAssignFor(null)} onDone={() => { setAssignFor(null); void load(); }} />}
      {rescheduleFor && <RescheduleModal visit={rescheduleFor} onClose={() => setRescheduleFor(null)} onDone={() => { setRescheduleFor(null); void load(); }} />}
    </div>
  );
}

function SidePanel({ title, icon: Icon, count, accent, children }: { title: string; icon: React.ElementType; count: number; accent?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className={cn("inline-flex items-center gap-2 text-sm font-semibold text-slate-700", accent)}><Icon className="h-4 w-4" /> {title}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{count}</span>
      </div>
      <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

function VisitCard({
  visit,
  conflict,
  compact,
  onDragStart,
  onAssign,
  onReschedule,
}: {
  visit: VisitWithSchedule;
  conflict?: boolean;
  compact?: boolean;
  onDragStart?: () => void;
  onAssign: () => void;
  onReschedule: () => void;
}) {
  const lead = visit.assignments?.find((a) => a.role === "lead")?.name ?? (visit.technician_id ? "Assigned" : "Unassigned");
  const assistantCount = (visit.assignments ?? []).filter((a) => a.role === "assistant").length;
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className={cn(
        "rounded-lg border bg-white p-2.5 text-left shadow-sm transition-colors",
        conflict ? "border-amber-300 ring-1 ring-amber-200" : "border-border hover:border-slate-300",
        onDragStart && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", STATUS_DOT[visit.status] ?? "bg-slate-300")} />
        <div className="min-w-0 flex-1">
          <Link href={`/dashboard/visits/${visit.id}`} className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-700">
            {visit.work_order_title ?? "Visit"}
          </Link>
          <p className="truncate text-xs text-slate-500">{visit.property_customer_name ?? visit.property_address ?? ""}</p>
          {!compact && (
            <p className="mt-0.5 text-xs text-slate-400">
              {visit.all_day ? "All day" : visit.arrival_window_start ? `${visit.arrival_window_start}${visit.arrival_window_end ? `–${visit.arrival_window_end}` : ""}` : "No time set"}
            </p>
          )}
          <p className="mt-1 truncate text-xs font-medium text-slate-600">
            {lead}{assistantCount > 0 ? ` +${assistantCount}` : ""}
          </p>
          {conflict && <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600"><AlertTriangle className="h-3 w-3" /> Double-booked</p>}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={onAssign} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"><UserPlus className="h-3.5 w-3.5" /> Assign</button>
        <button type="button" onClick={onReschedule} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"><CalendarClock className="h-3.5 w-3.5" /> Move</button>
      </div>
    </div>
  );
}
