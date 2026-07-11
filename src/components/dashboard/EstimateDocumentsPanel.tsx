"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { FileText, Plus, Search, ChevronRight } from "lucide-react";
import { EstimateStatus, type Estimate } from "@/types/estimate";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingRows } from "@/components/ui/LoadingState";
import { useApiQuery } from "@/lib/utils/useApiQuery";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<EstimateStatus, string> = {
  [EstimateStatus.DRAFT]: "bg-slate-100 text-slate-600 border-slate-200",
  [EstimateStatus.READY]: "bg-indigo-50 text-indigo-700 border-indigo-200",
  [EstimateStatus.SENT]: "bg-blue-50 text-blue-700 border-blue-200",
  [EstimateStatus.VIEWED]: "bg-cyan-50 text-cyan-700 border-cyan-200",
  [EstimateStatus.ACCEPTED]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [EstimateStatus.DECLINED]: "bg-red-50 text-red-600 border-red-200",
  [EstimateStatus.EXPIRED]: "bg-amber-50 text-amber-700 border-amber-200",
  [EstimateStatus.CONVERTED]: "bg-violet-50 text-violet-700 border-violet-200",
  [EstimateStatus.VOIDED]: "bg-slate-100 text-slate-400 border-slate-200",
};

const STATUS_FILTERS: (EstimateStatus | "")[] = [
  "",
  EstimateStatus.DRAFT,
  EstimateStatus.SENT,
  EstimateStatus.VIEWED,
  EstimateStatus.ACCEPTED,
  EstimateStatus.DECLINED,
  EstimateStatus.EXPIRED,
  EstimateStatus.CONVERTED,
];

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function EstimateDocumentsPanel() {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const perms = role ? rolePermissions[role] : undefined;

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState<EstimateStatus | "">("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (debounced) p.set("q", debounced);
    if (statusFilter) p.set("status", statusFilter);
    const qs = p.toString();
    return `/api/estimates${qs ? `?${qs}` : ""}`;
  }, [debounced, statusFilter]);

  const { data, error, loading, retry } = useApiQuery<Estimate[]>(url);
  const rows = data ?? [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search estimates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as EstimateStatus | "")}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s || "all"} value={s}>
              {s === "" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        {perms?.canManageEstimates && (
          <Link
            href="/dashboard/estimates/new"
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <Plus className="h-4 w-4" />
            New Estimate
          </Link>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : loading ? (
        <div className="rounded-xl border border-border bg-white shadow-sm">
          <LoadingRows rows={5} cols={5} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={debounced || statusFilter ? "No matching estimates" : "No estimates yet"}
          description={
            debounced || statusFilter
              ? "Try clearing the search or filter."
              : "Create your first priced proposal to send to a customer."
          }
          action={
            perms?.canManageEstimates && !(debounced || statusFilter) ? (
              <Link href="/dashboard/estimates/new" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                <Plus className="h-4 w-4" />
                New Estimate
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Number</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((est) => (
                  <tr key={est.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-500">{est.estimate_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link href={`/dashboard/estimates/${est.id}`} className="hover:text-brand-700">{est.title}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{est.customer_name}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-block rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_BADGE[est.status])}>
                        {est.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{money(est.total)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/estimates/${est.id}`} className="inline-flex text-slate-400 hover:text-slate-600">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((est) => (
              <Link
                key={est.id}
                href={`/dashboard/estimates/${est.id}`}
                className="block rounded-xl border border-border bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-slate-400">{est.estimate_number}</p>
                    <p className="truncate font-semibold text-slate-900">{est.title}</p>
                    <p className="truncate text-sm text-slate-500">{est.customer_name}</p>
                  </div>
                  <p className="shrink-0 font-mono text-base font-bold text-slate-900">{money(est.total)}</p>
                </div>
                <div className="mt-2">
                  <span className={cn("inline-block rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_BADGE[est.status])}>
                    {est.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
