"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { VisitWithSchedule } from "@/types/visit";

/**
 * Keyboard-accessible reschedule dialog — the required non-drag alternative to
 * drag-and-drop. Sends date + optional start time / duration / reason to the
 * versioned reschedule API.
 */
export function RescheduleModal({
  visit,
  onClose,
  onDone,
}: {
  visit: VisitWithSchedule;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(visit.scheduled_date);
  const [startTime, setStartTime] = useState(visit.arrival_window_start ?? "");
  const [duration, setDuration] = useState(visit.estimated_duration_minutes ? String(visit.estimated_duration_minutes) : "");
  const [allDay, setAllDay] = useState(visit.all_day);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/visits/${visit.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: visit.version,
          scheduled_date: date,
          start_time: allDay || !startTime ? undefined : startTime,
          duration_minutes: duration ? Number(duration) : undefined,
          all_day: allDay,
          reason: reason || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(res.status === 409 ? (json.error ?? "This visit changed — reload and retry.") : (json.error ?? "Failed to reschedule"));
        setSaving(false);
        return;
      }
      onDone();
    } catch {
      setError("Network error — please try again");
      setSaving(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400";
  const label = "mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Reschedule visit">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-slate-900">Reschedule</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">{visit.work_order_title ?? "Visit"} · {visit.property_customer_name}</p>
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="rs-date" className={label}>Date</label>
            <input id="rs-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 rounded border-border text-brand-600" />
            All-day
          </label>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="rs-time" className={label}>Start time</label>
                <input id="rs-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={input} />
              </div>
              <div>
                <label htmlFor="rs-dur" className={label}>Duration (min)</label>
                <input id="rs-dur" type="number" min="1" max="1440" value={duration} onChange={(e) => setDuration(e.target.value)} className={input} />
              </div>
            </div>
          )}
          <div>
            <label htmlFor="rs-reason" className={label}>Reason (optional)</label>
            <input id="rs-reason" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
