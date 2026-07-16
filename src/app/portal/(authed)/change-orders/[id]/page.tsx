"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { type PublicChangeOrder, ChangeOrderStatus } from "@/types/change-order";
import { money } from "@/components/portal/PortalShell";

export default function PortalChangeOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [co, setCo] = useState<PublicChangeOrder | null>(null);
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "accepting" | "declining">("view");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [decided, setDecided] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    fetch(`/api/portal/change-orders/${id}`).then(async (r) => {
      const j = (await r.json()) as { data?: PublicChangeOrder; version?: number; error?: string };
      if (!r.ok || !j.data) { setError(j.error ?? "Change order not found"); return; }
      setCo(j.data); setVersion(j.version ?? 1);
      if (j.data.accepted_at) setDecided("accepted");
      else if (j.data.rejected_at) setDecided("declined");
    }).finally(() => setLoading(false));
  }, [id]);

  async function submit(kind: "accept" | "decline") {
    setSubmitting(true); setActionErr(null);
    try {
      const res = await fetch(`/api/portal/change-orders/${id}/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "accept" ? { version, accepted_by_name: name } : { version, reason: reason || undefined }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) { setActionErr(j.error ?? "Something went wrong."); setSubmitting(false); return; }
      setDecided(kind === "accept" ? "accepted" : "declined"); setMode("view");
    } catch { setActionErr("Something went wrong."); setSubmitting(false); }
  }

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (error || !co) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><XCircle className="mx-auto mb-2 h-7 w-7 text-slate-300" /><p className="text-sm text-slate-600">{error ?? "Not found"}</p></div>;

  const open = !decided && (co.status === ChangeOrderStatus.SENT || co.status === ChangeOrderStatus.VIEWED) && !co.is_expired;

  return (
    <div className="space-y-5 pb-28">
      <button type="button" onClick={() => router.push("/portal/change-orders")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" /> Change Orders</button>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Change Order {co.change_order_number}</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">{co.reason}</h1>
        {co.scope_description && <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{co.scope_description}</p>}
      </div>

      {decided === "accepted" && <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><CheckCircle2 className="h-6 w-6 text-emerald-600" /><p className="font-semibold text-emerald-800">You&apos;ve approved this change order. Thank you!</p></div>}
      {decided === "declined" && <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5"><XCircle className="h-6 w-6 text-slate-400" /><p className="text-sm text-slate-600">You&apos;ve declined this change order.</p></div>}

      {co.line_items.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {co.line_items.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0"><p className="font-medium text-slate-900">{l.name}</p>{l.description && <p className="mt-0.5 text-sm text-slate-500">{l.description}</p>}<p className="mt-1 text-xs text-slate-400">{l.quantity}{l.unit ? ` ${l.unit}` : ""} × {money(l.unit_price)}</p></div>
                <p className="shrink-0 font-mono text-sm font-semibold text-slate-900">{money(l.total)}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 border-t border-slate-200 p-4 text-sm">
            <div className="flex justify-between text-slate-500"><span>Tax</span><span className="font-mono">{money(co.tax_impact_cents)}</span></div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-900"><span>Total Impact</span><span className="font-mono">{money(co.total_impact_cents)}</span></div>
          </div>
        </div>
      )}

      {co.schedule_impact_days != null && <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm"><p className="font-semibold text-slate-700">Schedule Impact</p><p className="mt-1 text-slate-600">Adds approximately {co.schedule_impact_days} day(s) to the project.</p></div>}
      {co.customer_notes && <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm"><p className="mb-1 font-semibold text-slate-700">Notes</p><p className="whitespace-pre-line">{co.customer_notes}</p></div>}

      {open && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur lg:left-64">
          <div className="mx-auto max-w-4xl">
            {actionErr && <p className="mb-2 text-center text-sm text-red-600">{actionErr}</p>}
            {mode === "view" && (
              <div className="flex gap-3">
                <button type="button" onClick={() => setMode("declining")} className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">Decline</button>
                <button type="button" onClick={() => setMode("accepting")} className="min-h-[48px] flex-[2] rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700">Approve — {money(co.total_impact_cents)}</button>
              </div>
            )}
            {mode === "accepting" && (
              <div className="space-y-3">
                <input type="text" placeholder="Type your full name to sign" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setMode("view")} className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">Back</button>
                  <button type="button" disabled={submitting || name.trim() === ""} onClick={() => submit("accept")} className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}Confirm Approval</button>
                </div>
              </div>
            )}
            {mode === "declining" && (
              <div className="space-y-3">
                <textarea placeholder="Optional: let us know why" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setMode("view")} className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">Back</button>
                  <button type="button" disabled={submitting} onClick={() => submit("decline")} className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-slate-700 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}Confirm Decline</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
