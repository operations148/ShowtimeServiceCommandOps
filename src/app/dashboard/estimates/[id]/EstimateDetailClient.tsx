"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Send,
  Pencil,
  Download,
  History,
  Activity,
  Ban,
  Unlock,
  Link2,
  Copy,
  Check,
} from "lucide-react";
import { EstimateStatus, type Estimate, type EstimateEvent, type EstimateVersion } from "@/types/estimate";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { isEditable } from "@/lib/estimates/state-machine";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/ui/ErrorState";
import { EstimateEditor } from "@/components/dashboard/EstimateEditor";
import { cn } from "@/lib/utils";

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function when(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";
}

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

export function EstimateDetailClient({ id }: { id: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const perms = role ? rolePermissions[role] : undefined;

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"activity" | "versions">("activity");
  const [events, setEvents] = useState<EstimateEvent[]>([]);
  const [versions, setVersions] = useState<EstimateVersion[]>([]);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${id}`);
      const json = (await res.json()) as { data?: Estimate; error?: string };
      if (!res.ok || !json.data) {
        setError(json.error ?? "Failed to load estimate");
      } else {
        setEstimate(json.data);
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
      fetch(`/api/estimates/${id}/activity`).then((r) => r.json()),
      fetch(`/api/estimates/${id}/versions`).then((r) => r.json()),
    ]);
    setEvents((ev as { data?: EstimateEvent[] }).data ?? []);
    setVersions((ve as { data?: EstimateVersion[] }).data ?? []);
  }, [id]);

  useEffect(() => {
    if (estimate) void loadActivity();
  }, [estimate, loadActivity]);

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
    if (!estimate) return;
    await doAction(async () => {
      const res = await fetch(`/api/estimates/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: estimate.version }),
      });
      const json = (await res.json()) as { data?: { previewMode: boolean; delivered: boolean; publicUrl: string }; error?: string };
      if (!res.ok || !json.data) {
        setActionErr(json.error ?? "Failed to send");
        return;
      }
      setPublicUrl(json.data.publicUrl);
      setActionMsg(json.data.previewMode ? "Preview mode — email not sent. Share the secure link below." : json.data.delivered ? "Estimate sent." : "Queued.");
      await load();
    });
  }

  async function handleTransition(to: EstimateStatus) {
    if (!estimate) return;
    await doAction(async () => {
      const res = await fetch(`/api/estimates/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: estimate.version, to }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionErr(json.error ?? "Failed to update status");
        return;
      }
      await load();
    });
  }

  async function handleOverride() {
    if (!estimate) return;
    const reason = window.prompt("Reason for overriding this estimate's lock (required):");
    if (!reason || reason.trim().length < 5) {
      setActionErr("A reason of at least 5 characters is required.");
      return;
    }
    await doAction(async () => {
      const res = await fetch(`/api/estimates/${id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionErr(json.error ?? "Failed to override");
        return;
      }
      setActionMsg("Estimate re-opened as a draft. The previous public link was revoked.");
      await load();
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
  if (error || !estimate) {
    return (
      <div className="mx-auto max-w-4xl">
        <ErrorState message={error ?? "Estimate not found"} onRetry={load} />
      </div>
    );
  }

  const editable = isEditable(estimate.status);
  const canManage = perms?.canManageEstimates ?? false;
  const canSend = perms?.canSendEstimateEmail ?? false;
  const canVoid = perms?.canVoidEstimates ?? false;
  const canOverride = perms?.canOverrideEstimateLock ?? false;
  const overridable = [EstimateStatus.ACCEPTED, EstimateStatus.DECLINED, EstimateStatus.EXPIRED].includes(estimate.status);

  if (editing) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Breadcrumb items={[{ label: "Estimates", href: "/dashboard/estimates" }, { label: estimate.estimate_number, href: `/dashboard/estimates/${id}` }, { label: "Edit" }]} className="mb-2" />
        <h2 className="font-display text-2xl font-bold text-slate-900">Edit {estimate.estimate_number}</h2>
        <EstimateEditor
          estimate={estimate}
          onSaved={(updated) => {
            setEstimate(updated);
            setEditing(false);
            void loadActivity();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const selectedLines = (estimate.line_items ?? []).filter((l) => l.kind === "standard" || l.is_selected);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumb items={[{ label: "Estimates", href: "/dashboard/estimates" }, { label: estimate.estimate_number }]} className="mb-2" />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl font-bold text-slate-900">{estimate.title}</h2>
            <span className={cn("inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_BADGE[estimate.status])}>
              {estimate.status}
            </span>
          </div>
          <p className="mt-1 font-mono text-sm text-slate-500">{estimate.estimate_number} · {estimate.customer_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && canManage && (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          {canSend && (estimate.status === EstimateStatus.DRAFT || estimate.status === EstimateStatus.READY || estimate.status === EstimateStatus.SENT || estimate.status === EstimateStatus.VIEWED) && (
            <button type="button" onClick={handleSend} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {estimate.status === EstimateStatus.SENT || estimate.status === EstimateStatus.VIEWED ? "Resend" : "Send"}
            </button>
          )}
          <a href={`/api/estimates/${id}/pdf`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
            <Download className="h-4 w-4" /> PDF
          </a>
          {overridable && canOverride && (
            <button type="button" onClick={handleOverride} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-100 disabled:opacity-50">
              <Unlock className="h-4 w-4" /> Override
            </button>
          )}
          {canVoid && estimate.status !== EstimateStatus.VOIDED && estimate.status !== EstimateStatus.CONVERTED && (
            <button type="button" onClick={() => handleTransition(EstimateStatus.VOIDED)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50">
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

      {/* Draft → ready toggle */}
      {estimate.status === EstimateStatus.DRAFT && canManage && (
        <button type="button" onClick={() => handleTransition(EstimateStatus.READY)} disabled={busy} className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          Mark Ready to Send
        </button>
      )}

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
            {selectedLines.map((line) => (
              <tr key={line.id}>
                <td className="px-5 py-3">
                  <span className="font-medium text-slate-900">{line.name}</span>
                  {line.kind !== "standard" && <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{line.kind}</span>}
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
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono">{money(estimate.subtotal)}</span></div>
          {estimate.discount_amount > 0 && <div className="flex justify-between text-slate-500"><span>Discount</span><span className="font-mono">−{money(estimate.discount_amount)}</span></div>}
          <div className="flex justify-between text-slate-500"><span>Tax ({(estimate.tax_rate * 100).toFixed(2)}%)</span><span className="font-mono">{money(estimate.tax_amount)}</span></div>
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-900"><span>Total</span><span className="font-mono">{money(estimate.total)}</span></div>
        </div>
      </div>

      {/* Decision summary */}
      {(estimate.accepted_at || estimate.declined_at || estimate.converted_invoice_id) && (
        <div className="rounded-xl border border-border bg-white p-5 text-sm shadow-sm">
          {estimate.accepted_at && <p className="text-emerald-700">Accepted by <strong>{estimate.accepted_by_name}</strong> on {when(estimate.accepted_at)}</p>}
          {estimate.declined_at && <p className="text-red-600">Declined on {when(estimate.declined_at)}{estimate.decline_reason ? ` — "${estimate.decline_reason}"` : ""}</p>}
          {estimate.converted_invoice_id && <p className="mt-1 text-violet-700">Converted to a draft invoice.</p>}
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
