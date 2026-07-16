"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Send,
  Pencil,
  History,
  Activity,
  Ban,
  Unlock,
  Link2,
  Copy,
  Check,
  CalendarClock,
  Receipt,
} from "lucide-react";
import { ChangeOrderStatus, type ChangeOrder, type ChangeOrderEvent, type ChangeOrderVersion } from "@/types/change-order";
import type { Visit } from "@/types/visit";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { isEditable, isPending } from "@/lib/change-orders/state-machine";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChangeOrderEditor } from "@/components/dashboard/ChangeOrderEditor";
import { cn } from "@/lib/utils";

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function when(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";
}

const STATUS_BADGE: Record<ChangeOrderStatus, string> = {
  [ChangeOrderStatus.DRAFT]: "bg-slate-100 text-slate-600 border-slate-200",
  [ChangeOrderStatus.SENT]: "bg-blue-50 text-blue-700 border-blue-200",
  [ChangeOrderStatus.VIEWED]: "bg-cyan-50 text-cyan-700 border-cyan-200",
  [ChangeOrderStatus.ACCEPTED]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [ChangeOrderStatus.REJECTED]: "bg-red-50 text-red-600 border-red-200",
  [ChangeOrderStatus.EXPIRED]: "bg-amber-50 text-amber-700 border-amber-200",
  [ChangeOrderStatus.VOIDED]: "bg-slate-100 text-slate-400 border-slate-200",
};

export function ChangeOrderDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const perms = role ? rolePermissions[role] : undefined;

  const [co, setCo] = useState<ChangeOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"activity" | "versions">("activity");
  const [events, setEvents] = useState<ChangeOrderEvent[]>([]);
  const [versions, setVersions] = useState<ChangeOrderVersion[]>([]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Apply-schedule-impact panel
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [visitId, setVisitId] = useState("");
  const [newDate, setNewDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/change-orders/${id}`);
      const json = (await res.json()) as { data?: ChangeOrder; error?: string };
      if (!res.ok || !json.data) {
        setError(json.error ?? "Failed to load change order");
      } else {
        setCo(json.data);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadActivity = useCallback(async () => {
    const [ev, ve] = await Promise.all([
      fetch(`/api/change-orders/${id}/activity`).then((r) => r.json()),
      fetch(`/api/change-orders/${id}/versions`).then((r) => r.json()),
    ]);
    setEvents((ev as { data?: ChangeOrderEvent[] }).data ?? []);
    setVersions((ve as { data?: ChangeOrderVersion[] }).data ?? []);
  }, [id]);

  useEffect(() => {
    if (co) void loadActivity();
  }, [co, loadActivity]);

  async function doAction(fn: () => Promise<void>) {
    setBusy(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    if (!co) return;
    await doAction(async () => {
      const res = await fetch(`/api/change-orders/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: co.version }),
      });
      const json = (await res.json()) as { data?: { previewMode: boolean; delivered: boolean; publicUrl: string }; error?: string };
      if (!res.ok || !json.data) {
        setActionErr(json.error ?? "Failed to send");
        return;
      }
      setPublicUrl(json.data.publicUrl);
      setActionMsg(json.data.previewMode ? "Preview mode — email not sent. Share the secure link below." : json.data.delivered ? "Change order sent." : "Queued.");
      await load();
    });
  }

  async function handleVoid() {
    if (!co) return;
    await doAction(async () => {
      const res = await fetch(`/api/change-orders/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: co.version, to: "voided" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionErr(json.error ?? "Failed to void change order");
        return;
      }
      await load();
    });
  }

  async function handleOverride() {
    if (!co) return;
    const reason = window.prompt("Reason for overriding this change order's lock (required):");
    if (!reason || reason.trim().length < 5) {
      setActionErr("A reason of at least 5 characters is required.");
      return;
    }
    await doAction(async () => {
      const res = await fetch(`/api/change-orders/${id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionErr(json.error ?? "Failed to override");
        return;
      }
      setActionMsg("Change order re-opened as a draft. The previous customer link was revoked.");
      await load();
    });
  }

  async function openSchedulePanel() {
    setScheduleOpen(true);
    if (!co) return;
    try {
      const res = await fetch(`/api/visits?work_order_id=${co.work_order_id}`);
      const json = (await res.json()) as { data?: Visit[] };
      setVisits(json.data ?? []);
    } catch {
      setVisits([]);
    }
  }

  async function handleApplyScheduleImpact() {
    if (!co || !visitId || !newDate) return;
    await doAction(async () => {
      const res = await fetch(`/api/change-orders/${id}/apply-schedule-impact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: visitId, new_scheduled_date: newDate }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionErr(json.error ?? "Failed to apply schedule impact");
        return;
      }
      setActionMsg("Schedule impact applied to the visit.");
      setScheduleOpen(false);
      await load();
    });
  }

  async function handleCreateInvoice() {
    await doAction(async () => {
      const res = await fetch(`/api/change-orders/${id}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { data?: { id: string }; error?: string };
      if (!res.ok || !json.data) {
        setActionErr(json.error ?? "Failed to create invoice");
        return;
      }
      router.push(`/dashboard/invoices/${json.data.id}`);
    });
  }

  function copyLink() {
    if (!publicUrl) return;
    void navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error || !co) {
    return (
      <div className="mx-auto max-w-4xl">
        <ErrorState message={error ?? "Change order not found"} onRetry={load} />
      </div>
    );
  }

  const editable = isEditable(co.status);
  const canManage = perms?.canManageChangeOrders ?? false;
  const canSend = perms?.canSendEstimateEmail ?? false;
  const canVoid = perms?.canVoidChangeOrders ?? false;
  const canOverride = perms?.canOverrideChangeOrderLock ?? false;
  const canViewCosts = perms?.canViewItemCosts ?? false;
  const canApplySchedule = perms?.canApplyScheduleImpact ?? false;
  const canInvoice = perms?.canManageInvoices ?? false;
  const overridable = [ChangeOrderStatus.ACCEPTED, ChangeOrderStatus.REJECTED, ChangeOrderStatus.EXPIRED].includes(co.status);
  const scheduleImpactReady = co.status === ChangeOrderStatus.ACCEPTED && !!co.schedule_impact_days && !co.schedule_impact_applied_at;

  if (editing) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Breadcrumb items={[{ label: "Work Orders", href: "/dashboard/work-orders" }, { label: co.change_order_number, href: `/dashboard/change-orders/${id}` }, { label: "Edit" }]} className="mb-2" />
        <h2 className="font-display text-2xl font-bold text-slate-900">Edit {co.change_order_number}</h2>
        <ChangeOrderEditor
          workOrderId={co.work_order_id}
          changeOrder={co}
          onSaved={(updated) => {
            setCo(updated);
            setEditing(false);
            void loadActivity();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumb items={[{ label: "Work Orders", href: "/dashboard/work-orders" }, { label: "Change Order", href: `/dashboard/work-orders/${co.work_order_id}` }, { label: co.change_order_number }]} className="mb-2" />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl font-bold text-slate-900">{co.change_order_number}</h2>
            <span className={cn("inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_BADGE[co.status])}>
              {co.status}
            </span>
            {isPending(co.status) && co.blocks_closeout && (
              <span className="inline-block rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                Blocks closeout
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-sm text-slate-500">{co.customer_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && canManage && (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          {canSend && (co.status === ChangeOrderStatus.DRAFT || co.status === ChangeOrderStatus.SENT || co.status === ChangeOrderStatus.VIEWED) && (
            <button type="button" onClick={handleSend} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {co.status === ChangeOrderStatus.SENT || co.status === ChangeOrderStatus.VIEWED ? "Resend" : "Send"}
            </button>
          )}
          {scheduleImpactReady && canApplySchedule && (
            <button type="button" onClick={openSchedulePanel} className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100">
              <CalendarClock className="h-4 w-4" /> Apply Schedule Impact
            </button>
          )}
          {co.status === ChangeOrderStatus.ACCEPTED && canInvoice && (
            <button type="button" onClick={handleCreateInvoice} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-50">
              <Receipt className="h-4 w-4" /> Create Invoice
            </button>
          )}
          {overridable && canOverride && (
            <button type="button" onClick={handleOverride} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-100 disabled:opacity-50">
              <Unlock className="h-4 w-4" /> Override
            </button>
          )}
          {canVoid && co.status !== ChangeOrderStatus.VOIDED && (
            <button type="button" onClick={handleVoid} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50">
              <Ban className="h-4 w-4" /> Void
            </button>
          )}
        </div>
      </div>

      {actionMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{actionMsg}</div>}
      {actionErr && <ErrorState message={actionErr} />}

      {/* Public link (after send) */}
      {publicUrl && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
          <Link2 className="h-4 w-4 shrink-0 text-brand-600" />
          <input readOnly value={publicUrl} className="min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-600 focus:outline-none" />
          <button type="button" onClick={copyLink} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold text-brand-700 shadow-sm hover:bg-brand-100">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {/* Apply schedule impact panel */}
      {scheduleOpen && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
          <p className="text-sm font-semibold text-indigo-900">Apply schedule impact ({co.schedule_impact_days} day(s))</p>
          <div className="flex flex-wrap gap-3">
            <select value={visitId} onChange={(e) => setVisitId(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
              <option value="">Select a visit…</option>
              {visits.map((v) => (
                <option key={v.id} value={v.id}>{v.scheduled_date} · {v.status}</option>
              ))}
            </select>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm" />
            <button type="button" onClick={handleApplyScheduleImpact} disabled={busy || !visitId || !newDate} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              Apply
            </button>
            <button type="button" onClick={() => setScheduleOpen(false)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reason / scope */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Reason</h3>
        <p className="text-sm text-slate-700">{co.reason}</p>
        {co.scope_description && (
          <>
            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Scope</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{co.scope_description}</p>
          </>
        )}
      </div>

      {/* Line items + totals */}
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3">Item</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(co.line_items ?? []).map((line) => (
              <tr key={line.id}>
                <td className="px-5 py-3">
                  <span className="font-medium text-slate-900">{line.name}</span>
                  {line.description && <p className="mt-0.5 text-xs text-slate-400">{line.description}</p>}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{line.quantity}{line.unit ? ` ${line.unit}` : ""}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-600">{money(line.unit_price)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{money(line.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t border-border p-4 text-sm">
          <div className="flex justify-between text-slate-500"><span>Price Impact</span><span className="font-mono">{money(co.price_impact_cents)}</span></div>
          <div className="flex justify-between text-slate-500"><span>Tax ({(co.tax_rate * 100).toFixed(2)}%)</span><span className="font-mono">{money(co.tax_impact_cents)}</span></div>
          {canViewCosts && co.cost_impact_cents != null && (
            <div className="flex justify-between text-slate-400"><span>Cost Impact</span><span className="font-mono">{money(co.cost_impact_cents)}</span></div>
          )}
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-900"><span>Total Impact</span><span className="font-mono">{money(co.total_impact_cents)}</span></div>
        </div>
      </div>

      {/* Schedule impact summary */}
      {co.schedule_impact_days != null && (
        <div className="rounded-xl border border-border bg-white p-5 text-sm shadow-sm">
          <p className="text-slate-700">
            Schedule impact: <strong>{co.schedule_impact_days > 0 ? "+" : ""}{co.schedule_impact_days} day(s)</strong>
            {co.schedule_impact_applied_at ? ` — applied ${when(co.schedule_impact_applied_at)}` : " — not yet applied"}
          </p>
          {co.schedule_impact_note && <p className="mt-1 text-slate-500">{co.schedule_impact_note}</p>}
        </div>
      )}

      {/* Decision summary */}
      {(co.accepted_at || co.rejected_at) && (
        <div className="rounded-xl border border-border bg-white p-5 text-sm shadow-sm">
          {co.accepted_at && <p className="text-emerald-700">Accepted by <strong>{co.accepted_by_name}</strong> on {when(co.accepted_at)}</p>}
          {co.rejected_at && <p className="text-red-600">Declined on {when(co.rejected_at)}{co.reject_reason ? ` — "${co.reject_reason}"` : ""}</p>}
        </div>
      )}

      {/* Activity / versions tabs */}
      <div>
        <div className="mb-3 flex gap-1 border-b border-border">
          <button type="button" onClick={() => setTab("activity")} className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold", tab === "activity" ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
            <Activity className="h-4 w-4" /> Activity
          </button>
          <button type="button" onClick={() => setTab("versions")} className={cn("-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold", tab === "versions" ? "border-brand-500 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
            <History className="h-4 w-4" /> Versions ({versions.length})
          </button>
        </div>

        {tab === "activity" ? (
          <ul className="space-y-2">
            {events.length === 0 && <li className="text-sm text-slate-400">No activity yet.</li>}
            {events.map((ev) => (
              <li key={ev.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white px-4 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-slate-700">{ev.event_type.replace(/_/g, " ")}</span>
                  {ev.actor_name && <span className="text-slate-400"> · {ev.actor_name}</span>}
                  {ev.recipient_email && <span className="text-slate-400"> · {ev.recipient_email}</span>}
                  {ev.preview_mode && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">preview</span>}
                  {ev.error_detail && <p className="text-xs text-red-500">{ev.error_detail}</p>}
                </div>
                <span className="shrink-0 text-xs text-slate-400">{when(ev.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {versions.length === 0 && <li className="text-sm text-slate-400">No versions recorded.</li>}
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-lg border border-border bg-white px-4 py-2.5 text-sm">
                <span className="font-medium text-slate-700">v{v.version} · <span className="text-slate-500">{v.version_type}</span></span>
                <span className="text-xs text-slate-400">{when(v.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
