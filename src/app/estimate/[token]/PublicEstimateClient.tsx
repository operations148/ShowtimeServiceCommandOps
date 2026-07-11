"use client";

import { useState, useEffect, useMemo } from "react";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import type { PublicEstimate, PublicEstimateLineItem } from "@/types/estimate";

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; estimate: PublicEstimate; version: number };

export function PublicEstimateClient({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"view" | "accepting" | "declining">("view");
  const [name, setName] = useState("");
  const [termsOk, setTermsOk] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [decided, setDecided] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/public/estimates/${encodeURIComponent(token)}`);
        const json = (await res.json()) as { data?: PublicEstimate; version?: number; error?: string };
        if (!active) return;
        if (!res.ok || !json.data) {
          setState({ phase: "error", message: json.error ?? "This estimate is unavailable." });
          return;
        }
        setState({ phase: "ready", estimate: json.data, version: json.version ?? 1 });
        // Pre-select any optional lines the estimator marked selected by default.
        setSelected(new Set(json.data.line_items.filter((l) => l.kind !== "standard" && l.is_selected).map((l) => l.id)));
        if (json.data.accepted_at) setDecided("accepted");
        else if (json.data.declined_at) setDecided("declined");
      } catch {
        if (active) setState({ phase: "error", message: "This estimate is unavailable." });
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const est = state.phase === "ready" ? state.estimate : null;

  // Client-side running total (display only; the server recomputes authoritatively).
  const runningTotal = useMemo(() => {
    if (!est) return 0;
    const lines = est.line_items.filter((l) => l.kind === "standard" || selected.has(l.id));
    const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
    const taxable = lines.filter((l) => l.taxable).reduce((sum, l) => sum + l.total, 0);
    const tax = Math.round(taxable * est.tax_rate);
    return subtotal - est.discount_amount + tax;
  }, [est, selected]);

  function toggleOption(line: PublicEstimateLineItem) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(line.id)) {
        next.delete(line.id);
      } else {
        // Enforce one-per-option-group on the client (server re-validates).
        if (line.option_group) {
          for (const other of est?.line_items ?? []) {
            if (other.option_group === line.option_group) next.delete(other.id);
          }
        }
        next.add(line.id);
      }
      return next;
    });
  }

  async function submitAccept() {
    if (state.phase !== "ready") return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/public/estimates/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: state.version,
          selected_line_ids: [...selected],
          accepted_by_name: name,
          terms_acknowledged: true,
        }),
      });
      const json = (await res.json()) as { error?: string; data?: { alreadyDecided?: boolean } };
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
      const res = await fetch(`/api/public/estimates/${encodeURIComponent(token)}/decline`, {
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

  const estimate = state.estimate;
  const expired = estimate.is_expired;
  const alreadyDecided = decided !== null || estimate.status === "accepted" || estimate.status === "declined" || estimate.status === "converted" || estimate.status === "voided";

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Branding header */}
      <header className="bg-[#0C1E2E] px-5 py-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {estimate.company_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={estimate.company_logo_url} alt={estimate.company_name} className="h-9 max-w-[160px] object-contain" />
          ) : (
            <p className="text-lg font-semibold text-white">{estimate.company_name}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5">
        {/* Title card */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Estimate {estimate.estimate_number}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">{estimate.title}</h1>
          <p className="mt-1 text-sm text-slate-500">Prepared for {estimate.customer_name}</p>
          {estimate.expires_at && (
            <p className={`mt-2 text-xs font-medium ${expired ? "text-red-600" : "text-slate-400"}`}>
              {expired ? "Expired" : `Valid until ${new Date(estimate.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
            </p>
          )}
        </div>

        {/* Decided banner */}
        {decided === "accepted" && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-800">Thank you — your estimate is accepted.</p>
              <p className="text-sm text-emerald-700">We&apos;ll be in touch about next steps.</p>
            </div>
          </div>
        )}
        {decided === "declined" && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <XCircle className="h-6 w-6 shrink-0 text-slate-400" />
            <p className="text-sm text-slate-600">You&apos;ve declined this estimate. Contact us if you change your mind.</p>
          </div>
        )}

        {/* Line items */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {estimate.line_items.map((line) => {
              const isOption = line.kind !== "standard";
              const isSel = line.kind === "standard" || selected.has(line.id);
              return (
                <div key={line.id} className="flex items-start gap-3 p-4">
                  {isOption && !alreadyDecided && (
                    <button
                      type="button"
                      onClick={() => toggleOption(line)}
                      aria-pressed={isSel}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        isSel ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSel && <CheckCircle2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium ${isSel ? "text-slate-900" : "text-slate-400"}`}>{line.name}</p>
                      {isOption && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {line.kind}
                        </span>
                      )}
                    </div>
                    {line.description && <p className="mt-0.5 text-sm text-slate-500">{line.description}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      {line.quantity}
                      {line.unit ? ` ${line.unit}` : ""} × {money(line.unit_price)}
                    </p>
                  </div>
                  <p className={`shrink-0 font-mono text-sm font-semibold ${isSel ? "text-slate-900" : "text-slate-300"}`}>
                    {money(line.total)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="space-y-1.5 border-t border-slate-200 p-4 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span className="font-mono">{money(estimate.line_items.filter((l) => l.kind === "standard" || selected.has(l.id)).reduce((s, l) => s + l.total, 0))}</span>
            </div>
            {estimate.discount_amount > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Discount</span>
                <span className="font-mono">−{money(estimate.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-500">
              <span>Tax</span>
              <span className="font-mono">{money(Math.round(estimate.line_items.filter((l) => (l.kind === "standard" || selected.has(l.id)) && l.taxable).reduce((s, l) => s + l.total, 0) * estimate.tax_rate))}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-900">
              <span>Total</span>
              <span className="font-mono">{money(runningTotal)}</span>
            </div>
          </div>
        </div>

        {/* Notes + terms */}
        {estimate.customer_notes && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            <p className="mb-1 font-semibold text-slate-700">Notes</p>
            <p className="whitespace-pre-line">{estimate.customer_notes}</p>
          </div>
        )}
        {estimate.terms && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-500 shadow-sm">
            <p className="mb-1 font-semibold text-slate-600">Terms</p>
            <p className="whitespace-pre-line">{estimate.terms}</p>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Secure estimate from {estimate.company_name}
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
                  Accept — {money(runningTotal)}
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
                <label className="flex items-start gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                  <span>I agree to the terms and authorize the work described in this estimate.</span>
                </label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setMode("view")} className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submitting || name.trim() === "" || !termsOk}
                    onClick={submitAccept}
                    className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm Acceptance
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
