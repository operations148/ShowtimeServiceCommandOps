"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Home, FileText, CircleDollarSign } from "lucide-react";
import { money, statusLabel } from "@/components/portal/PortalShell";

interface Overview {
  name: string;
  property_count: number;
  outstanding_balance_cents: number;
  open_estimates: number;
  upcoming_visits: number;
  recent_work: { id: string; wo_number: string; title: string; status: string; scheduled_date: string | null }[];
  recent_invoices: { id: string; number: string; title: string; status: string; amount_due: number }[];
}

export default function PortalOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/overview").then((r) => r.json()).then((j) => setData(j.data ?? null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (!data) return <p className="text-sm text-slate-500">Nothing to show yet.</p>;

  const stats = [
    { label: "Amount Due", value: money(data.outstanding_balance_cents), icon: CircleDollarSign, href: "/portal/invoices", accent: data.outstanding_balance_cents > 0 },
    { label: "Open Estimates", value: String(data.open_estimates), icon: FileText, href: "/portal/estimates" },
    { label: "Upcoming Visits", value: String(data.upcoming_visits), icon: Home, href: "/portal/work-history" },
    { label: "Properties", value: String(data.property_count), icon: Home, href: "/portal/properties" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Welcome back, {data.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-slate-500">Here&apos;s a summary of your account.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-200">
              <Icon className={`h-5 w-5 ${s.accent ? "text-red-500" : "text-brand-500"}`} />
              <p className={`mt-2 font-mono text-lg font-bold ${s.accent ? "text-red-600" : "text-slate-900"}`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </Link>
          );
        })}
      </div>

      {data.recent_invoices.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent Invoices</h2>
            <Link href="/portal/invoices" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all</Link>
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {data.recent_invoices.map((inv) => (
              <Link key={inv.id} href={`/portal/invoices/${inv.id}`} className="flex items-center justify-between gap-3 p-3.5 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{inv.title}</p>
                  <p className="font-mono text-xs text-slate-400">{inv.number} · {statusLabel(inv.status)}</p>
                </div>
                <span className={`shrink-0 font-mono text-sm font-semibold ${inv.amount_due > 0 ? "text-red-600" : "text-emerald-600"}`}>{money(inv.amount_due)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.recent_work.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent Work</h2>
            <Link href="/portal/work-history" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all</Link>
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {data.recent_work.map((wo) => (
              <div key={wo.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{wo.title}</p>
                  <p className="font-mono text-xs text-slate-400">{wo.wo_number} · {statusLabel(wo.status)}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{wo.scheduled_date ?? ""}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
