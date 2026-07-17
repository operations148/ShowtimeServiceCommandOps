"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Building2, Users, Wrench, Receipt, ShieldAlert, Power } from "lucide-react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import type { TenantAdminSummary } from "@/lib/db/queries/platform-admin";

export function PlatformAdminClient() {
  const [tenants, setTenants] = useState<TenantAdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/platform/tenants", { cache: "no-store" });
      const j = (await res.json()) as { data?: TenantAdminSummary[]; error?: string };
      if (!res.ok) { setError(j.error ?? "Failed to load"); return; }
      setTenants(j.data ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggle(t: TenantAdminSummary) {
    const next = !t.is_active;
    if (!next && !confirm(`Suspend ${t.name}? Its users will lose access until reactivated.`)) return;
    setBusy(t.id);
    try {
      const res = await fetch(`/api/platform/tenants/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) { setError(j.error ?? "Failed to update"); return; }
      setTenants((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_active: next } : x)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Platform Admin" }]} className="mb-2" />
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          <h1 className="font-display text-2xl font-bold text-slate-900">Platform Admin</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Cross-tenant operations. Aggregate metadata only — no tenant&apos;s customer data is shown here.
        </p>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">{error}</div>
      ) : (
        <div className="space-y-3">
          {tenants.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                    <Building2 className="h-5 w-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{t.name}</p>
                    <p className="font-mono text-xs text-slate-400">{t.slug} · since {t.created_at.slice(0, 10)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                    {t.is_active ? "Active" : "Suspended"}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(t)}
                    disabled={busy === t.id}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      t.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                    }`}
                  >
                    {busy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                    {t.is_active ? "Suspend" : "Activate"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-slate-100 sm:grid-cols-4">
                <Stat icon={Users} label="Users" value={t.counts.users} />
                <Stat icon={Wrench} label="Technicians" value={t.counts.technicians} />
                <Stat icon={Building2} label="Work Orders" value={t.counts.work_orders} />
                <Stat icon={Receipt} label="Open Invoices" value={t.counts.open_invoices} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="bg-white px-4 py-3 text-center">
      <p className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-0.5 font-mono text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}
