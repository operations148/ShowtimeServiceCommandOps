"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Car, Loader2, Check, Plus } from "lucide-react";
import type { TechTimeEntry, TechMileageEntry } from "@/types/costing";

/**
 * Technician time + mileage logging (Phase 9).
 *
 * Deliberately shows NO money: this component never receives a rate or a cost,
 * because the API redacts them for technicians (ADR-0016 §3). The tech reports
 * quantities; the server prices them. Sized for one-handed phone use.
 */
export function LogTimeMileageCard({
  workOrderId,
  visitId,
  disabled = false,
}: {
  workOrderId: string;
  visitId?: string;
  disabled?: boolean;
}) {
  const [time, setTime] = useState<TechTimeEntry[]>([]);
  const [mileage, setMileage] = useState<TechMileageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"none" | "time" | "mileage">("none");
  const [minutes, setMinutes] = useState("");
  const [miles, setMiles] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([
        fetch(`/api/work-orders/${workOrderId}/time-entries`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/work-orders/${workOrderId}/mileage-entries`).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (t?.data) setTime(t.data as TechTimeEntry[]);
      if (m?.data) setMileage(m.data as TechMileageEntry[]);
    } catch {
      /* non-blocking — logging is additive to the job flow */
    }
  }, [workOrderId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  function reset() {
    setMode("none"); setMinutes(""); setMiles(""); setNotes(""); setError(null);
  }

  async function submit() {
    setSaving(true); setError(null);
    try {
      const isTime = mode === "time";
      const url = `/api/work-orders/${workOrderId}/${isTime ? "time-entries" : "mileage-entries"}`;
      const body = isTime
        ? { visit_id: visitId, minutes: parseInt(minutes, 10), notes: notes || undefined }
        : { visit_id: visitId, miles: parseFloat(miles), notes: notes || undefined };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) { setError(j.error ?? "Couldn't save"); return; }

      reset();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      await load();
    } catch {
      setError("Couldn't save — check your connection.");
    } finally {
      setSaving(false);
    }
  }

  const totalMinutes = time.reduce((s, t) => s + t.minutes, 0);
  const totalMiles = Number(mileage.reduce((s, m) => s + m.miles, 0).toFixed(2));
  const canSubmit = mode === "time" ? parseInt(minutes, 10) > 0 : parseFloat(miles) > 0;

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Time &amp; Mileage</p>
        {justSaved && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Logged
          </span>
        )}
      </div>

      {(totalMinutes > 0 || totalMiles > 0) && (
        <div className="mb-3 flex gap-4 text-sm">
          {totalMinutes > 0 && (
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <Clock className="h-4 w-4 text-slate-300" />
              {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
            </span>
          )}
          {totalMiles > 0 && (
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <Car className="h-4 w-4 text-slate-300" />
              {totalMiles} mi
            </span>
          )}
        </div>
      )}

      {mode === "none" ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("time")}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Time
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("mileage")}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Miles
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {mode === "time" ? (
            <input
              type="number" inputMode="numeric" min="1" max="1440" autoFocus
              value={minutes} onChange={(e) => setMinutes(e.target.value)}
              placeholder="Minutes on this job"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          ) : (
            <input
              type="number" inputMode="decimal" step="0.1" min="0.1" max="2000" autoFocus
              value={miles} onChange={(e) => setMiles(e.target.value)}
              placeholder="Miles driven"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          )}
          <input
            type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Note (optional)"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button" onClick={reset}
              className="min-h-[44px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 active:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button" onClick={submit} disabled={saving || !canSubmit}
              className="inline-flex min-h-[44px] flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-semibold text-white active:bg-brand-600 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Log {mode === "time" ? "Time" : "Miles"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
