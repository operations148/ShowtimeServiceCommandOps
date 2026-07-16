"use client";

import { useState, useEffect, useCallback } from "react";
import { CreditCard, CheckCircle2, AlertTriangle, Loader2, ExternalLink } from "lucide-react";

interface ConnectStatus {
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
}

/**
 * Stripe Connect onboarding + status panel (Phase 6). Lives in the admin
 * settings page. Onboarding rides canManageSettings server-side; this only
 * renders the button + live status.
 */
export function StripeConnectSection() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/stripe/status");
      const json = (await res.json()) as { data?: ConnectStatus; error?: string };
      if (json.data) setStatus(json.data);
      else setError(json.error ?? "Could not load Stripe status");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function startOnboarding() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/stripe/onboard", { method: "POST" });
      const json = (await res.json()) as { data?: { url: string }; error?: string };
      if (!res.ok || !json.data) { setError(json.error ?? "Failed to start onboarding"); setStarting(false); return; }
      window.location.href = json.data.url;
    } catch {
      setError("Network error");
      setStarting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-slate-50/60 px-6 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <CreditCard className="h-4 w-4 text-brand-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Payments (Stripe Connect)</p>
          <p className="text-xs text-slate-500">Accept card payments on invoices. You are the merchant of record.</p>
        </div>
      </div>
      <div className="px-6 py-5">
        {error && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{error}</div>}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking status…</div>
        ) : status?.connected && status.chargesEnabled ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Connected — you can accept card payments.
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-slate-400">Payouts</dt><dd className="text-slate-700">{status.payoutsEnabled ? "Enabled" : "Pending"}</dd></div>
              <div><dt className="text-slate-400">Account</dt><dd className="font-mono text-slate-700">{status.accountId}</dd></div>
            </dl>
            {status.requirementsDue.length > 0 && (
              <p className="text-xs text-amber-600">Stripe still needs: {status.requirementsDue.join(", ")}</p>
            )}
            <button type="button" onClick={startOnboarding} disabled={starting} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              Update Stripe details
            </button>
          </div>
        ) : status?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <AlertTriangle className="h-4 w-4" /> Onboarding incomplete — charges not yet enabled.
            </div>
            {status.requirementsDue.length > 0 && (
              <p className="text-xs text-slate-500">Stripe still needs: {status.requirementsDue.join(", ")}</p>
            )}
            <button type="button" onClick={startOnboarding} disabled={starting} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Continue onboarding
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Connect a Stripe account to let customers pay invoices online with a card. Setup takes a few minutes.</p>
            <button type="button" onClick={startOnboarding} disabled={starting} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Connect Stripe
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
