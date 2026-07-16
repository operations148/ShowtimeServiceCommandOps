"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";

/**
 * Magic-link landing page. Consumes the token via a client-side POST (email
 * prefetchers don't run JS, so the one-time token isn't burned by a scan),
 * then redirects into the portal on success.
 */
export default function PortalAuthPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/portal/auth/consume", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!active) return;
        if (res.ok) { router.replace("/portal/overview"); return; }
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? "This sign-in link is invalid or has expired.");
      } catch {
        if (active) setError("Something went wrong. Please request a new link.");
      }
    })();
    return () => { active = false; };
  }, [token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      {error ? (
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <XCircle className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-600">{error}</p>
          <a href="/portal/login" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700">Request a new link</a>
        </div>
      ) : (
        <div className="text-center text-slate-400">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
          <p className="text-sm">Signing you in…</p>
        </div>
      )}
    </div>
  );
}
