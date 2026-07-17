"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2, TrendingUp, TrendingDown, Banknote, FileText, AlertCircle, Info,
} from "lucide-react";
import { rolePermissions } from "@/config/roles";
import { UserRole } from "@/types/technician";
import { formatCents } from "@/lib/money/money";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ReportingTabs } from "@/components/reporting";
import type { FinancialReport } from "@/types/financial-report";

const PRESETS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export function FinancialReportClient() {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const allowed = role ? rolePermissions[role].canViewFinancialReports : false;

  const [preset, setPreset] = useState(30);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    setLoading(true); setError(null);
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = isoDaysAgo(days - 1);
      const res = await fetch(`/api/reports/financial?from=${from}&to=${to}`, { cache: "no-store" });
      const j = (await res.json()) as { data?: FinancialReport; error?: string };
      if (!res.ok || !j.data) { setError(j.error ?? "Failed to load"); return; }
      setReport(j.data);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (allowed) void load(preset); }, [allowed, preset, load]);

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <AlertCircle className="mx-auto mb-2 h-7 w-7 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">Financial reports are owner-only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Breadcrumb items={[{ label: "Reports", href: "/dashboard/reports/owner" }, { label: "Financial" }]} />
      <ReportingTabs />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Financial Report</h1>
          <p className="mt-1 text-sm text-slate-500">Revenue, cost, margin, and receivables — from your invoices and job costing.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setPreset(p.days)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                preset === p.days ? "bg-brand-500 text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">{error}</div>
      ) : report ? (
        <Report report={report} />
      ) : null}
    </div>
  );
}

function Report({ report }: { report: FinancialReport }) {
  const profitable = report.gross_profit_cents >= 0;

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium text-slate-400">
        {report.from} → {report.to}
      </p>

      {/* Headline: profit + margin */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Invoiced"
          value={formatCents(report.revenue.invoiced_cents)}
          icon={FileText}
          sub={`${report.counts.invoices_issued} invoice(s)`}
        />
        <Kpi
          label="Collected"
          value={formatCents(report.revenue.collected_cents)}
          icon={Banknote}
          sub={`${report.counts.payments_received} payment(s)`}
          tone="good"
        />
        <Kpi
          label="Gross Profit"
          value={formatCents(report.gross_profit_cents)}
          icon={profitable ? TrendingUp : TrendingDown}
          tone={profitable ? "good" : "bad"}
        />
        <Kpi
          label="Gross Margin"
          value={report.gross_margin === null ? "—" : `${(report.gross_margin * 100).toFixed(1)}%`}
          sub={report.gross_margin === null ? "Nothing invoiced" : undefined}
          tone={report.gross_margin === null ? undefined : profitable ? "good" : "bad"}
        />
      </div>

      {/* Revenue + cost breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue">
          <Line label="Invoiced (billed)" value={report.revenue.invoiced_cents} />
          <Line label="Collected (banked)" value={report.revenue.collected_cents} tone="good" />
          <Line label="Outstanding (owed)" value={report.revenue.outstanding_cents} tone={report.revenue.outstanding_cents > 0 ? "warn" : undefined} />
          <Line label="Written off (void/credit)" value={report.revenue.written_off_cents} muted />
        </Panel>
        <Panel title="Cost to Deliver">
          <Line label="Labor" value={report.cost.labor_cents} />
          <Line label="Mileage" value={report.cost.mileage_cents} />
          <Line label="Expenses" value={report.cost.expense_cents} />
          <Line label="Total cost" value={report.cost.total_cost_cents} bold />
        </Panel>
      </div>

      {/* AR aging */}
      <Panel title={`Accounts Receivable — ${report.ar_aging.open_invoice_count} open invoice(s)`}>
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-5">
          <Bucket label="Current" value={report.ar_aging.current_cents} />
          <Bucket label="1–30 days" value={report.ar_aging.days_1_30_cents} tone={report.ar_aging.days_1_30_cents > 0 ? "warn" : undefined} />
          <Bucket label="31–60 days" value={report.ar_aging.days_31_60_cents} tone={report.ar_aging.days_31_60_cents > 0 ? "warn" : undefined} />
          <Bucket label="61–90 days" value={report.ar_aging.days_61_90_cents} tone={report.ar_aging.days_61_90_cents > 0 ? "bad" : undefined} />
          <Bucket label="90+ days" value={report.ar_aging.days_90_plus_cents} tone={report.ar_aging.days_90_plus_cents > 0 ? "bad" : undefined} />
        </div>
      </Panel>

      {/* Caveats — part of the report, not a footnote */}
      {report.caveats.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
          {report.caveats.map((c, i) => (
            <p key={i} className="flex items-start gap-2 text-xs text-amber-800">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {c}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label, value, sub, tone, icon: Icon,
}: { label: string; value: string; sub?: string; tone?: "good" | "bad"; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </p>
      <p className={`mt-1 font-mono text-xl font-bold ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Line({
  label, value, tone, bold, muted,
}: { label: string; value: number; tone?: "good" | "warn"; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 px-5 py-2.5 last:border-0">
      <span className={`text-sm ${muted ? "text-slate-400" : "text-slate-600"}`}>{label}</span>
      <span className={`font-mono text-sm ${bold ? "font-bold text-slate-900" : tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-slate-700"}`}>
        {formatCents(value)}
      </span>
    </div>
  );
}

function Bucket({ label, value, tone }: { label: string; value: number; tone?: "warn" | "bad" }) {
  return (
    <div className="bg-white px-4 py-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 font-mono text-sm font-bold ${tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-slate-900"}`}>
        {formatCents(value)}
      </p>
    </div>
  );
}
