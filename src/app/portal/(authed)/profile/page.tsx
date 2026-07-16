"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, User } from "lucide-react";

interface Profile { email: string; name: string; phone: string | null }

export default function PortalProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/profile").then((r) => r.json()).then((j: { data?: Profile }) => {
      if (j.data) { setProfile(j.data); setName(j.data.name); setPhone(j.data.phone ?? ""); }
    }).finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await fetch("/api/portal/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }),
      });
      const j = (await res.json()) as { data?: Profile; error?: string };
      if (!res.ok || !j.data) { setError(j.error ?? "Unable to save."); return; }
      setProfile(j.data); setSaved(true);
    } catch { setError("Something went wrong."); } finally { setSaving(false); }
  }

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600"><User className="h-5 w-5" /></div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Your Profile</h1>
      </div>

      <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Email</label>
          <input type="email" value={profile?.email ?? ""} disabled className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" />
          <p className="mt-1 text-xs text-slate-400">Your email is your sign-in identity and can&apos;t be changed here.</p>
        </div>
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Full Name</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Phone</label>
          <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving || name.trim() === ""} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save Changes</button>
          {saved && <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
        </div>
      </form>
    </div>
  );
}
