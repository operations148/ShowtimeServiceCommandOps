"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { CalendarCheck, Search, ChevronRight } from "lucide-react";
import { VisitStatus, type VisitWithSchedule } from "@/types/visit";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingRows } from "@/components/ui/LoadingState";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  skipped: "bg-slate-100 text-slate-500 border-slate-200",
  rescheduled: "bg-violet-50 text-violet-700 border-violet-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};

function firstOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function addMonthsISO(dateStr: string, months: number): string {
  const [y, m] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 10);
}

export function VisitsAdminClient() {
  const now = new Date();
  const [from, setFrom] = useState(firstOfMonth(now));
  const [to, setTo] = useState(addMonthsISO(firstOfMonth(now), 1));
  const [status, setStatus] = useState<VisitStatus | "">("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<VisitWithSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedule?from=${from}&to=${to}`);
      const json = (await res.json()) as { data?: VisitWithSchedule[]; error?: string };
      if (!res.ok) { setError(json.error ?? "Failed to load visits"); setLoading(false); return; }
      setRows(json.data ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((v) => {
      if (status && v.status !== status) return false;
      if (term) {
        const hay = `${v.work_order_title ?? ""} ${v.property_customer_name ?? ""} ${v.property_address ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, status, search]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Visits" }]} className="mb-2" />
        <h2 className="font-display text-2xl font-bold text-slate-900">Visits</h2>
        <p className="mt-1 text-sm text-slate-500">All scheduled and completed service visits. Use Dispatch to assign and reschedule on a calendar.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="v-from" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">From</label>
          <input id="v-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
        </div>
        <div>
          <label htmlFor="v-to" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">To</label>
          <input id="v-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as VisitStatus | "")} className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.values(VisitStatus).map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" placeholder="Search customer, address, job…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <div className="rounded-xl border border-border bg-white shadow-sm"><LoadingRows rows={6} cols={5} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No visits in range" description="Adjust the date range or filters to see visits." />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Technician</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{v.scheduled_date}</td>
                    <td className="px-4 py-3 font-medium text-slate-900"><Link href={`/dashboard/visits/${v.id}`} className="hover:text-brand-700">{v.work_order_title ?? "Visit"}</Link></td>
                    <td className="px-4 py-3 text-slate-600">{v.property_customer_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{v.assignments?.find((a) => a.role === "lead")?.name ?? (v.technician_id ? "Assigned" : "Unassigned")}</td>
                    <td className="px-4 py-3"><span className={cn("inline-block rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_BADGE[v.status])}>{v.status.replace(/_/g, " ")}</span></td>
                    <td className="px-4 py-3 text-right"><Link href={`/dashboard/visits/${v.id}`} className="inline-flex text-slate-400 hover:text-slate-600"><ChevronRight className="h-4 w-4" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {filtered.map((v) => (
              <Link key={v.id} href={`/dashboard/visits/${v.id}`} className="block rounded-xl border border-border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-400">{v.scheduled_date}</p>
                    <p className="truncate font-semibold text-slate-900">{v.work_order_title ?? "Visit"}</p>
                    <p className="truncate text-sm text-slate-500">{v.property_customer_name ?? v.property_address ?? ""}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_BADGE[v.status])}>{v.status.replace(/_/g, " ")}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
