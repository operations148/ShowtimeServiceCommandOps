"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import type { PublicChangeOrder } from "@/types/change-order";

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; changeOrder: PublicChangeOrder; version: number };

export function PublicChangeOrderClient({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [mode, setMode] = useState<"view" | "accepting" | "declining">("view");
  const [name, setName] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [decided, setDecided] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/public/change-orders/${encodeURIComponent(token)}`);
        const json = (await res.json()) as { data?: PublicChangeOrder; version?: number; error?: string };
        if (!active) return;
        if (!res.ok || !json.data) {
          setState({ phase: "error", message: json.error ?? "This change order is unavailable." });
          return;
        }
        setState({ phase: "ready", changeOrder: json.data, version: json.version ?? 1 });
        if (json.data.accepted_at) setDecided("accepted");
        else if (json.data.rejected_at) setDecided("declined");
      } catch {
        if (active) setState({ phase: "error", message: "This change order is unavailable." });
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  async function submitAccept() {
    if (state.phase !== "ready") return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/public/change-orders/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: state.version, accepted_by_name: name }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSubmitError(json.error ?? "Unable to accept. Please try again.");
        setSubmitting(false);
        return;
      }
      setDecided("accepted");
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  async function submitDecline() {
    if (state.phase !== "ready") return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/public/change-orders/${encodeURIComponent(token)}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: state.version, reason: declineReason || undefined }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSubmitError(json.error ?? "Unable to decline. Please try again.");
        setSubmitting(false);
        return;
      }
      setDecided("declined");
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (state.phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <XCircle className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-600">{state.message}</p>
        </div>
      </div>
    );
  }

  const co = state.changeOrder;
  const expired = co.is_expired;
  const alreadyDecided = decided !== null || co.status === "accepted" || co.status === "rejected" || co.status === "voided" || co.status === "expired";

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Branding header */}
      <header className="bg-[#0C1E2E] px-5 py-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {co.company_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={co.company_logo_url} alt={co.company_name} className="h-9 max-w-[160px] object-contain" />
          ) : (
            <p className="text-lg font-semibold text-white">{co.company_name}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5">
        {/* Title card */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Change Order {co.change_order_number}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">{co.reason}</h1>
          <p className="mt-1 text-sm text-slate-500">Prepared for {co.customer_name}</p>
          {co.scope_description && <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{co.scope_description}</p>}
          {expired && <p className="mt-2 text-xs font-medium text-red-600">Expired</p>}
        </div>

        {/* Decided banner */}
        {decided === "accepted" && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-800">Thank you — the change order is approved.</p>
              <p className="text-sm text-emerald-700">We&apos;ll proceed with the additional work described above.</p>
            </div>
          </div>
        )}
        {decided === "declined" && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <XCircle className="h-6 w-6 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-600">You&apos;ve declined this change order. Contact us if you change your mind.</p>
          </div>
        )}

        {/* Line items */}
        {co.line_items.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {co.line_items.map((line) => (
                <div key={line.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{line.name}</p>
                    {line.description && <p className="mt-0.5 text-sm text-slate-500">{line.description}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      {line.quantity}
                      {line.unit ? ` ${line.unit}` : ""} × {money(line.unit_price)}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-semibold text-slate-900">{money(line.total)}</p>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1.5 border-t border-slate-200 p-4 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Tax</span>
                <span className="font-mono">{money(co.tax_impact_cents)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-900">
                <span>Total Impact</span>
                <span className="font-mono">{money(co.total_impact_cents)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Schedule impact */}
        {co.schedule_impact_days != null && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
            <p className="font-semibold text-slate-700">Schedule Impact</p>
            <p className="mt-1 text-slate-600">
              This change adds approximately {co.schedule_impact_days} day(s) to the project timeline.
            </p>
            {co.schedule_impact_note && <p className="mt-1 text-slate-500">{co.schedule_impact_note}</p>}
          </div>
        )}

        {/* Notes */}
        {co.customer_notes && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            <p className="mb-1 font-semibold text-slate-700">Notes</p>
            <p className="whitespace-pre-line">{co.customer_notes}</p>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Secure change order from {co.company_name}
        </p>
      </main>

      {/* Action bar */}
      {!alreadyDecided && !expired && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            {submitError && <p className="mb-2 text-center text-sm text-red-600">{submitError}</p>}

            {mode === "view" && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode("declining")}
                  className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => setMode("accepting")}
                  className="min-h-[48px] flex-[2] rounded-xl bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  Approve — {money(co.total_impact_cents)}
                </button>
              </div>
            )}

            {mode === "accepting" && (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Type your full name to sign"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setMode("view")} className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submitting || name.trim() === ""}
                    onClick={submitAccept}
                    className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm Approval
                  </button>
                </div>
              </div>
            )}

            {mode === "declining" && (
              <div className="space-y-3">
                <textarea
                  placeholder="Optional: let us know why (helps us improve)"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setMode("view")} className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={submitDecline}
                    className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-slate-700 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm Decline
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
