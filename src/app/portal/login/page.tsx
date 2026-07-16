"use client";

import { useState, useEffect } from "react";
import { Loader2, Mail, CheckCircle2, ShieldCheck } from "lucide-react";
import type { PortalBranding } from "@/types/portal";

export default function PortalLoginPage() {
  const [branding, setBranding] = useState<PortalBranding | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/portal/branding")
      .then((r) => r.json())
      .then((j) => { if (active) setBranding(j.data ?? null); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/request-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) { setError("Too many requests. Please try again later."); setSubmitting(false); return; }
      const json = (await res.json()) as { error?: string };
      if (res.status === 422) { setError(json.error ?? "Enter a valid email."); setSubmitting(false); return; }
      // Always show the generic success (no enumeration).
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const company = branding?.company_name ?? "Customer Portal";

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {branding?.company_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.company_logo_url} alt={company} className="mx-auto mb-4 h-12 max-w-[220px] object-contain" />
          ) : (
            <p className="mb-2 font-display text-2xl font-bold text-slate-900">{company}</p>
          )}
          <h1 className="font-display text-xl font-bold text-slate-900">Customer Portal</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to view your estimates, invoices, and service history.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {sent ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-slate-900">Check your email</p>
              <p className="mt-1 text-sm text-slate-500">If an account exists for <strong>{email}</strong>, we&apos;ve sent a secure sign-in link. It expires in 20 minutes.</p>
              <button type="button" onClick={() => { setSent(false); setEmail(""); }} className="mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700">Use a different email</button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Email address</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                </div>
              </div>
              <button type="submit" disabled={submitting || !email.trim()}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Email me a sign-in link
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Passwordless & secure — no password to remember.
        </p>
        {branding?.company_phone && (
          <p className="mt-2 text-center text-xs text-slate-400">Need help? Call {branding.company_phone}</p>
        )}
      </div>
    </div>
  );
}
