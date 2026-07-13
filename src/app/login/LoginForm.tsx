"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Waves, ShieldCheck } from "lucide-react";

const BRAND_NAVY = "#0C1E2E";
const BRAND_CYAN = "#06B6D4";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already authenticated, navigate to the appropriate home
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(searchParams.get("callbackUrl") ?? "/dashboard/overview");
    }
  }, [status, router, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard/overview";

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    router.replace(callbackUrl);
  }

  if (status === "loading" || status === "authenticated") {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: BRAND_NAVY }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel — branding ── */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex lg:w-2/5"
        style={{ background: BRAND_NAVY }}
      >
        {/* Dot-grid background texture */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(6,182,212,0.12) 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />

        {/* Top gradient fade */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#0C1E2E] to-transparent" />

        {/* Logo lockup */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: `linear-gradient(135deg, ${BRAND_CYAN}, #0891b2)`,
              boxShadow: `0 0 20px rgba(6,182,212,0.35)`,
            }}
          >
            <Waves className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span
            className="font-display text-xl font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-sora)" }}
          >
            ServiceOps
          </span>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <h1
              className="text-4xl font-bold leading-tight tracking-tight text-white"
              style={{ fontFamily: "var(--font-sora)" }}
            >
              Field operations,
              <br />
              <span style={{ color: BRAND_CYAN }}>simplified.</span>
            </h1>
            <p className="max-w-xs text-base leading-relaxed text-slate-400">
              Work orders, job checklists, property history, and GHL sync —
              all in one place for your service team.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {["Work Orders", "Tech Mobile", "GHL Sync", "Reports"].map((f) => (
              <span
                key={f}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: "rgba(6,182,212,0.12)",
                  color: BRAND_CYAN,
                  border: "1px solid rgba(6,182,212,0.25)",
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom client badge */}
        <div className="relative z-10 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
            style={{ background: "rgba(6,182,212,0.3)" }}
          >
            SP
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Showtime Pool Service</p>
            <p className="text-xs text-slate-400">California · GoHighLevel connected</p>
          </div>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 py-12">
        {/* Mobile logo (shown only on small screens) */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: `linear-gradient(135deg, ${BRAND_CYAN}, #0891b2)` }}
          >
            <Waves className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span
            className="text-xl font-bold text-slate-900"
            style={{ fontFamily: "var(--font-sora)" }}
          >
            ServiceOps
          </span>
        </div>

        <div className="w-full max-w-sm space-y-8">
          {/* Heading */}
          <div className="space-y-1">
            <h2
              className="text-2xl font-bold tracking-tight text-slate-900"
              style={{ fontFamily: "var(--font-sora)" }}
            >
              Sign in to your account
            </h2>
            <p className="text-sm text-slate-500">
              Enter your credentials to access the Command Center.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <a href="/forgot-password" className="text-xs font-medium text-cyan-600 hover:underline">
                  Forgot password?
                </a>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:opacity-60"
              style={{
                background: `linear-gradient(135deg, ${BRAND_CYAN}, #0891b2)`,
                boxShadow: `0 2px 12px rgba(6,182,212,0.3)`,
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Demo accounts
            </div>
            <div className="space-y-3">
              {[
                {
                  label: "Admin",
                  email: "admin@showtime.local",
                  color: "bg-cyan-50 text-cyan-700 border-cyan-100",
                },
                {
                  label: "Technician",
                  email: "tech@showtime.local",
                  color: "bg-amber-50 text-amber-700 border-amber-100",
                },
              ].map((u) => (
                <button
                  key={u.label}
                  type="button"
                  onClick={() => {
                    setEmail(u.email);
                    setPassword("");
                    setError(null);
                  }}
                  className="flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                >
                  <span
                    className={`mt-0.5 rounded-md border px-1.5 py-0.5 text-xs font-semibold ${u.color}`}
                  >
                    {u.label}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-700">
                      {u.email}
                    </p>
                    <p className="text-xs text-slate-400">Enter password to sign in</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
