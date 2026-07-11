"use client";

import { useState, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import type { VisitWithSchedule } from "@/types/visit";

interface Technician {
  id: string;
  name: string;
  is_active: boolean;
}

/** Multi-technician assignment: one lead + any number of assistants. */
export function AssignVisitModal({
  visit,
  onClose,
  onDone,
}: {
  visit: VisitWithSchedule;
  onClose: () => void;
  onDone: () => void;
}) {
  const [techs, setTechs] = useState<Technician[]>([]);
  const [lead, setLead] = useState<string>(visit.technician_id ?? "");
  const [assistants, setAssistants] = useState<Set<string>>(
    new Set((visit.assignments ?? []).filter((a) => a.role === "assistant").map((a) => a.technician_id))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/technicians")
      .then((r) => r.json())
      .then((j: { data?: Technician[] }) => setTechs((j.data ?? []).filter((t) => t.is_active)))
      .catch(() => setTechs([]));
  }, []);

  function toggleAssistant(id: string) {
    setAssistants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/visits/${visit.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: visit.version,
          lead_technician_id: lead || null,
          assistant_technician_ids: [...assistants].filter((a) => a !== lead),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(res.status === 409 ? (json.error ?? "This visit changed — reload and retry.") : (json.error ?? "Failed to assign"));
        setSaving(false);
        return;
      }
      onDone();
    } catch {
      setError("Network error — please try again");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Assign technicians">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-slate-900">Assign technicians</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">{visit.work_order_title ?? "Visit"} · {visit.property_customer_name}</p>
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

        <div className="mb-4">
          <label htmlFor="assign-lead" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Lead technician</label>
          <select id="assign-lead" value={lead} onChange={(e) => setLead(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400">
            <option value="">— Unassigned —</option>
            {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Additional technicians</p>
        <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
          {techs.filter((t) => t.id !== lead).map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2">
              <input id={`asst-${t.id}`} type="checkbox" checked={assistants.has(t.id)} onChange={() => toggleAssistant(t.id)} className="h-4 w-4 rounded border-border text-brand-600" />
              <label htmlFor={`asst-${t.id}`} className="text-sm text-slate-700">{t.name}</label>
            </li>
          ))}
          {techs.filter((t) => t.id !== lead).length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No other technicians</li>}
        </ul>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
