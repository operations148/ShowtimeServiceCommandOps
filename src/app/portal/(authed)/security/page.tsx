"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Monitor, LogOut } from "lucide-react";
import type { PortalSessionSummary } from "@/types/portal";

export default function PortalSecurityPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<PortalSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function load() {
    const j = (await (await fetch("/api/portal/sessions")).json()) as { data?: PortalSessionSummary[] };
    setSessions(j.data ?? []);
  }
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function revoke(id: string, current: boolean) {
    setRevoking(id);
    try {
      await fetch(`/api/portal/sessions/${id}`, { method: "DELETE" });
      if (current) { router.push("/portal/login"); return; }
      await load();
    } finally { setRevoking(null); }
  }

  function friendlyAgent(ua: string | null | undefined): string {
    if (!ua) return "Unknown device";
    if (/iphone/i.test(ua)) return "iPhone";
    if (/ipad/i.test(ua)) return "iPad";
    if (/android/i.test(ua)) return "Android device";
    if (/mac/i.test(ua)) return "Mac";
    if (/windows/i.test(ua)) return "Windows PC";
    return "Web browser";
  }

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600"><ShieldCheck className="h-5 w-5" /></div>
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Security</h1>
          <p className="text-sm text-slate-500">Devices currently signed in to your account.</p>
        </div>
      </div>

      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <Monitor className="h-5 w-5 shrink-0 text-slate-300" />
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{friendlyAgent(s.user_agent)}{s.current && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">This device</span>}</p>
                <p className="text-xs text-slate-400">{s.ip ?? "Unknown IP"} · last active {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString("en-US") : new Date(s.issued_at).toLocaleString("en-US")}</p>
              </div>
            </div>
            <button type="button" onClick={() => revoke(s.id, s.current)} disabled={revoking === s.id} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:border-red-200 hover:text-red-600 disabled:opacity-50">{revoking === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}{s.current ? "Sign out" : "Revoke"}</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">Don&apos;t recognize a device? Revoke it, then sign out and back in on your own device. Your sign-in links expire automatically.</p>
    </div>
  );
}
