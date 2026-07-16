"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CheckCircle2, UserPlus, X, Loader2, Home, ShieldOff, ShieldCheck, Mail, LogOut, Circle } from "lucide-react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import type { PortalCustomer } from "@/types/portal";

interface Property { id: string; customer_name: string; address_line1: string; address_line2: string | null }
type Row = PortalCustomer & { property_ids: string[] };
type Toast = { message: string; kind: "ok" | "err" };

function addressLabel(p: Property): string {
  return `${p.address_line1}${p.address_line2 ? `, ${p.address_line2}` : ""} — ${p.customer_name}`;
}

export function PortalUsersPageClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, kind: "ok" | "err" = "ok", ms = 5000) => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), ms);
  }, []);

  const load = useCallback(async () => {
    const [uRes, pRes] = await Promise.all([fetch("/api/portal-users"), fetch("/api/properties?is_active=true")]);
    const uJson = (await uRes.json()) as { data?: Row[] };
    const pJson = (await pRes.json()) as { data?: Property[] };
    setRows(uJson.data ?? []);
    setProperties(pJson.data ?? []);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: "Portal Users" }]} className="mb-2" />
          <h2 className="font-display text-2xl font-bold text-slate-900">Customer Portal Access</h2>
          <p className="mt-1 text-sm text-slate-500">Invite customers to view their estimates, invoices, and service history, scoped to their properties.</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {toast && (
            <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${toast.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
              {toast.kind === "ok" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
              <span>{toast.message}</span>
              <button type="button" onClick={() => setToast(null)} className="ml-1 rounded p-0.5 hover:bg-black/5" aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <button type="button" onClick={() => setInviteOpen(true)} className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
            <UserPlus className="h-4 w-4" /> Invite Customer
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <Contact className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No portal customers yet</p>
          <p className="mt-1 text-sm text-slate-400">Invite your first customer to give them self-service access.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Properties</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last sign-in</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3"><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-400">{r.email}</p></td>
                  <td className="px-4 py-3 text-slate-600">{r.property_ids.length}</td>
                  <td className="px-4 py-3">
                    {r.is_active
                      ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600"><Circle className="h-1.5 w-1.5 fill-current" /> Active</span>
                      : <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500"><Circle className="h-1.5 w-1.5 fill-current" /> Revoked</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.last_login_at ? new Date(r.last_login_at).toLocaleDateString("en-US") : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen && (
        <InviteModal properties={properties} onClose={() => setInviteOpen(false)} onSuccess={(name) => { setInviteOpen(false); load(); showToast(`Invite sent to ${name}`); }} onError={(m) => showToast(m, "err")} />
      )}
      {selected && (
        <DetailPanel row={selected} properties={properties} onClose={() => setSelected(null)} onChanged={() => { load(); }} toast={showToast} />
      )}
    </div>
  );
}

// Local icon to avoid an extra import round-trip mismatch.
function Contact({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  );
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

function InviteModal({ properties, onClose, onSuccess, onError }: {
  properties: Property[]; onClose: () => void; onSuccess: (name: string) => void; onError: (m: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (picked.size === 0) { setErr("Select at least one property."); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/portal-users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), phone: phone.trim() || undefined, property_ids: [...picked] }),
      });
      const j = (await res.json()) as { data?: PortalCustomer; error?: string };
      if (!res.ok) { setErr(j.error ?? "Unable to invite."); onError(j.error ?? "Unable to invite."); return; }
      onSuccess(name.trim());
    } catch { setErr("Something went wrong."); } finally { setSaving(false); }
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="font-display text-lg font-bold text-slate-900">Invite Customer</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Field label="Email"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="customer@example.com" /></Field>
          <Field label="Full Name"><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="Phone (optional)"><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Properties ({picked.size})</p>
            {properties.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">No active properties to link.</p>
            ) : (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {properties.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 hover:bg-slate-50">
                    <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                    <span className="text-sm text-slate-700"><Home className="mr-1 inline h-3.5 w-3.5 text-slate-300" />{addressLabel(p)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Send Invite</button>
        </div>
      </form>
    </Overlay>
  );
}

// ─── Detail slide-over ─────────────────────────────────────────────────────────

interface SessionRow { id: string; issued_at: string; last_seen_at: string | null; expires_at: string; revoked_at: string | null; ip: string | null; user_agent: string | null }
interface EventRow { id: string; event_type: string; created_at: string; ip: string | null }

function DetailPanel({ row, properties, onClose, onChanged, toast }: {
  row: Row; properties: Property[]; onClose: () => void; onChanged: () => void; toast: (m: string, k?: "ok" | "err") => void;
}) {
  const [detail, setDetail] = useState<{ customer: PortalCustomer; property_ids: string[]; sessions: SessionRow[]; events: EventRow[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set(row.property_ids));
  const [busy, setBusy] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const reload = useCallback(async () => {
    const j = (await (await fetch(`/api/portal-users/${row.id}`)).json()) as { data?: { customer: PortalCustomer; property_ids: string[]; sessions: SessionRow[]; events: EventRow[] } };
    if (j.data) { setDetail(j.data); setPicked(new Set(j.data.property_ids)); }
  }, [row.id]);
  useEffect(() => { reload(); }, [reload]);

  function toggle(id: string) {
    dirtyRef.current = true;
    setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function saveProperties() {
    setBusy("props");
    try {
      const res = await fetch(`/api/portal-users/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property_ids: [...picked] }) });
      if (!res.ok) { const j = (await res.json()) as { error?: string }; toast(j.error ?? "Unable to save", "err"); return; }
      dirtyRef.current = false; toast("Property access updated"); onChanged(); reload();
    } finally { setBusy(null); }
  }

  async function setActive(active: boolean) {
    setBusy("active");
    try {
      const res = await fetch(`/api/portal-users/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: active }) });
      if (!res.ok) { toast("Unable to update access", "err"); return; }
      toast(active ? "Access restored" : "Access revoked"); onChanged(); reload();
    } finally { setBusy(null); }
  }

  async function resend() {
    setBusy("resend");
    try {
      const res = await fetch(`/api/portal-users/${row.id}/resend`, { method: "POST" });
      toast(res.ok ? "New sign-in link sent" : "Unable to send link", res.ok ? "ok" : "err");
    } finally { setBusy(null); }
  }

  async function revokeSessions() {
    setBusy("sessions");
    try {
      const res = await fetch(`/api/portal-users/${row.id}/revoke-sessions`, { method: "POST" });
      toast(res.ok ? "All sessions signed out" : "Unable to revoke sessions", res.ok ? "ok" : "err"); reload();
    } finally { setBusy(null); }
  }

  const c = detail?.customer ?? row;
  const activeSessions = (detail?.sessions ?? []).filter((s) => !s.revoked_at && new Date(s.expires_at) > new Date());

  return (
    <Overlay onClose={onClose}>
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">{c.name}</h3>
            <p className="text-sm text-slate-400">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {!c.is_active && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Access is revoked. This customer can&apos;t sign in until restored.</div>}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <ActionBtn onClick={resend} busy={busy === "resend"} icon={Mail} label="Resend sign-in link" />
            <ActionBtn onClick={revokeSessions} busy={busy === "sessions"} icon={LogOut} label="Sign out all devices" disabled={activeSessions.length === 0} />
            {c.is_active
              ? <ActionBtn onClick={() => setActive(false)} busy={busy === "active"} icon={ShieldOff} label="Revoke access" danger />
              : <ActionBtn onClick={() => setActive(true)} busy={busy === "active"} icon={ShieldCheck} label="Restore access" />}
          </div>

          {/* Properties */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Property Access ({picked.size})</p>
              {dirtyRef.current && <button type="button" onClick={saveProperties} disabled={busy === "props"} className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{busy === "props" && <Loader2 className="h-3 w-3 animate-spin" />}Save</button>}
            </div>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {properties.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 hover:bg-slate-50">
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
                  <span className="text-sm text-slate-700">{addressLabel(p)}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Sessions */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Active Sessions ({activeSessions.length})</p>
            {activeSessions.length === 0 ? <p className="text-sm text-slate-400">No active sessions.</p> : (
              <ul className="space-y-1.5 text-sm">{activeSessions.map((s) => (
                <li key={s.id} className="flex justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className="truncate text-slate-600">{s.ip ?? "Unknown IP"}</span>
                  <span className="shrink-0 text-slate-400">{new Date(s.last_seen_at ?? s.issued_at).toLocaleString("en-US")}</span>
                </li>
              ))}</ul>
            )}
          </section>

          {/* Access history */}
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Recent Activity</p>
            {!detail ? <Loader2 className="h-4 w-4 animate-spin text-slate-300" /> : detail.events.length === 0 ? <p className="text-sm text-slate-400">No activity recorded.</p> : (
              <ul className="space-y-1 text-sm">{detail.events.slice(0, 15).map((e) => (
                <li key={e.id} className="flex justify-between text-slate-500"><span>{e.event_type.replace(/_/g, " ")}</span><span className="text-slate-400">{new Date(e.created_at).toLocaleString("en-US")}</span></li>
              ))}</ul>
            )}
          </section>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>{children}</div>;
}

function ActionBtn({ onClick, busy, icon: Icon, label, danger, disabled }: {
  onClick: () => void; busy: boolean; icon: React.ComponentType<{ className?: string }>; label: string; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40 ${danger ? "border-red-200 text-red-600 hover:bg-red-50" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{label}
    </button>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div className="relative h-full w-full max-w-md bg-white shadow-2xl">{children}</div>
    </div>
  );
}
