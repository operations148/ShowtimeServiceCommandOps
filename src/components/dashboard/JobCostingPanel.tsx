"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Loader2, TrendingUp, TrendingDown, Plus, X, Clock, Car, Receipt } from "lucide-react";
import { rolePermissions } from "@/config/roles";
import { UserRole } from "@/types/technician";
import { formatCents } from "@/lib/money/money";
import type { JobCostSummary, TimeEntry, MileageEntry, JobExpense, ExpenseCategory } from "@/types/costing";
import { EXPENSE_CATEGORIES } from "@/types/costing";

/**
 * Owner-facing job costing (Phase 9). Rendered only for roles with
 * canViewJobCosting — the server enforces the same rail, so this check is
 * presentation, not security.
 */
export function JobCostingPanel({ workOrderId }: { workOrderId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const perms = role ? rolePermissions[role] : undefined;

  const [summary, setSummary] = useState<JobCostSummary | null>(null);
  const [time, setTime] = useState<TimeEntry[]>([]);
  const [mileage, setMileage] = useState<MileageEntry[]>([]);
  const [expenses, setExpenses] = useState<JobExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [s, t, m, e] = await Promise.all([
      fetch(`/api/work-orders/${workOrderId}/costing`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/work-orders/${workOrderId}/time-entries`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/work-orders/${workOrderId}/mileage-entries`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/work-orders/${workOrderId}/expenses`).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (s?.data) setSummary(s.data as JobCostSummary);
    if (t?.data) setTime(t.data as TimeEntry[]);
    if (m?.data) setMileage(m.data as MileageEntry[]);
    if (e?.data) setExpenses(e.data as JobExpense[]);
  }, [workOrderId]);

  useEffect(() => {
    if (!perms?.canViewJobCosting) { setLoading(false); return; }
    load().finally(() => setLoading(false));
  }, [perms?.canViewJobCosting, load]);

  if (!perms?.canViewJobCosting) return null;
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!summary) return null;

  const profitable = summary.margin_cents >= 0;
  const hours = Math.floor(summary.total_minutes / 60);
  const mins = summary.total_minutes % 60;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">Job Costing</h3>
          <p className="text-xs text-slate-400">What this job actually cost to deliver.</p>
        </div>
        {perms.canLogJobCosts && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <Plus className="h-3.5 w-3.5" /> Add expense
          </button>
        )}
      </div>

      {/* Margin headline */}
      <div className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-4">
        <Stat label="Contract" value={formatCents(summary.contract_cents)} />
        <Stat label="Actual cost" value={formatCents(summary.total_cost_cents)} />
        <Stat
          label="Margin"
          value={formatCents(summary.margin_cents)}
          tone={profitable ? "good" : "bad"}
          icon={profitable ? TrendingUp : TrendingDown}
        />
        <Stat
          label="Margin %"
          // null margin means "no contract value yet" — NOT 0%. Rendering these
          // the same would tell an owner a job broke even when we simply don't know.
          value={summary.margin_percent === null ? "—" : `${(summary.margin_percent * 100).toFixed(1)}%`}
          hint={summary.margin_percent === null ? "No contract value set" : undefined}
          tone={summary.margin_percent === null ? undefined : profitable ? "good" : "bad"}
        />
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-px bg-slate-200">
        <Stat label="Labor" value={formatCents(summary.labor_cents)} sub={`${hours}h ${mins}m`} icon={Clock} />
        <Stat label="Mileage" value={formatCents(summary.mileage_cents)} sub={`${summary.total_miles} mi`} icon={Car} />
        <Stat label="Expenses" value={formatCents(summary.expense_cents)} sub={`${summary.entry_counts.expense} item(s)`} icon={Receipt} />
      </div>

      {summary.billable_expense_cents > 0 && (
        <div className="border-t border-slate-100 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
          {formatCents(summary.billable_expense_cents)} of these expenses are marked billable — they are <strong>not</strong> added
          to any invoice automatically. Add them to an invoice yourself if you want to charge for them.
        </div>
      )}

      {/* Entries */}
      <div className="divide-y divide-slate-100">
        {time.map((t) => (
          <Row key={t.id} icon={Clock} title={`${Math.floor(t.minutes / 60)}h ${t.minutes % 60}m`} sub={t.notes ?? "Labor"} amount={formatCents(t.cost_cents)} />
        ))}
        {mileage.map((m) => (
          <Row key={m.id} icon={Car} title={`${m.miles} mi`} sub={m.notes ?? "Travel"} amount={formatCents(m.cost_cents)} />
        ))}
        {expenses.map((e) => (
          <Row
            key={e.id}
            icon={Receipt}
            title={e.description}
            sub={`${e.category}${e.vendor ? ` · ${e.vendor}` : ""}${e.billable ? " · billable" : ""}`}
            amount={formatCents(e.amount_cents)}
          />
        ))}
        {time.length + mileage.length + expenses.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            No time, mileage, or expenses logged yet.
          </p>
        )}
      </div>

      {adding && (
        <AddExpenseModal
          workOrderId={workOrderId}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); void load(); }}
        />
      )}
    </div>
  );
}

function Stat({
  label, value, sub, hint, tone, icon: Icon,
}: {
  label: string; value: string; sub?: string; hint?: string;
  tone?: "good" | "bad"; icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white px-5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </p>
      <p className={`mt-0.5 font-mono text-base font-bold ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      {hint && <p className="text-[11px] italic text-slate-400">{hint}</p>}
    </div>
  );
}

function Row({
  icon: Icon, title, sub, amount,
}: { icon: React.ComponentType<{ className?: string }>; title: string; sub: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{title}</p>
          <p className="truncate text-xs text-slate-400">{sub}</p>
        </div>
      </div>
      <span className="shrink-0 font-mono text-sm text-slate-600">{amount}</span>
    </div>
  );
}

function AddExpenseModal({
  workOrderId, onClose, onAdded,
}: { workOrderId: string; onClose: () => void; onAdded: () => void }) {
  const [category, setCategory] = useState<ExpenseCategory>("material");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [billable, setBillable] = useState(false);
  const [markup, setMarkup] = useState("0");
  const [incurredOn, setIncurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      // Dollars in the input → integer cents on the wire. All server math is cents.
      const amountCents = Math.round(parseFloat(amount || "0") * 100);
      const res = await fetch(`/api/work-orders/${workOrderId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category, description: description.trim(), vendor: vendor.trim() || undefined,
          amount_cents: amountCents, billable, markup_percent: parseFloat(markup || "0"),
          incurred_on: incurredOn,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) { setError(j.error ?? "Unable to save"); return; }
      onAdded();
    } catch { setError("Something went wrong."); } finally { setSaving(false); }
  }

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="font-display text-base font-bold text-slate-900">Add Expense</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputCls}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Description</label>
            <input required value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Pump seal kit" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Vendor</label>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Amount ($)</label>
              <input required type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Date</label>
            <input type="date" value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
            Billable to customer
          </label>
          {billable && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Markup %</label>
              <input type="number" step="0.1" min="0" value={markup} onChange={(e) => setMarkup(e.target.value)} className={inputCls} />
              <p className="mt-1 text-xs text-slate-400">Recorded only — nothing is added to an invoice automatically.</p>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save
          </button>
        </div>
      </form>
    </div>
  );
}
