"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type { ChangeOrder } from "@/types/change-order";

interface LineDraft {
  name: string;
  description: string;
  unit: string;
  quantity: string;
  unit_price: string; // dollars
  taxable: boolean;
  discount_amount: string; // dollars
}

function emptyLine(): LineDraft {
  return { name: "", description: "", unit: "", quantity: "1", unit_price: "", taxable: true, discount_amount: "" };
}

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Number((n * 100).toFixed(4)));
}

function centsToDollars(c: number): string {
  return (c / 100).toFixed(2);
}

export interface ChangeOrderEditorProps {
  /** Required for create — the parent work order this change order belongs to. */
  workOrderId: string;
  /** Prefilled from the work order's linked property; the API resolves the
   * authoritative customer name server-side regardless of what's submitted. */
  defaultCustomerName?: string;
  /** Present in edit mode; absent for create. */
  changeOrder?: ChangeOrder;
  onSaved: (changeOrder: ChangeOrder) => void;
  onCancel: () => void;
}

export function ChangeOrderEditor({ workOrderId, defaultCustomerName, changeOrder, onSaved, onCancel }: ChangeOrderEditorProps) {
  const isEdit = !!changeOrder;
  const [reason, setReason] = useState(changeOrder?.reason ?? "");
  const [scopeDescription, setScopeDescription] = useState(changeOrder?.scope_description ?? "");
  const [customerName, setCustomerName] = useState(changeOrder?.customer_name ?? defaultCustomerName ?? "");
  const [customerEmail, setCustomerEmail] = useState(changeOrder?.customer_email ?? "");
  const [taxRatePct, setTaxRatePct] = useState(changeOrder ? (changeOrder.tax_rate * 100).toString() : "0");
  const [scheduleImpactDays, setScheduleImpactDays] = useState(changeOrder?.schedule_impact_days != null ? String(changeOrder.schedule_impact_days) : "");
  const [scheduleImpactNote, setScheduleImpactNote] = useState(changeOrder?.schedule_impact_note ?? "");
  const [blocksCloseout, setBlocksCloseout] = useState(changeOrder?.blocks_closeout ?? true);
  const [customerNotes, setCustomerNotes] = useState(changeOrder?.customer_notes ?? "");
  const [internalNotes, setInternalNotes] = useState(changeOrder?.internal_notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    changeOrder?.line_items?.length
      ? changeOrder.line_items.map((l) => ({
          name: l.name,
          description: l.description ?? "",
          unit: l.unit ?? "",
          quantity: String(l.quantity),
          unit_price: centsToDollars(l.unit_price),
          taxable: l.taxable,
          discount_amount: l.discount_amount ? centsToDollars(l.discount_amount) : "",
        }))
      : [emptyLine()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payloadLines = lines
      .filter((l) => l.name.trim() !== "")
      .map((l) => ({
        name: l.name.trim(),
        description: l.description || undefined,
        unit: l.unit || undefined,
        quantity: Number.parseFloat(l.quantity) || 0,
        unit_price: dollarsToCents(l.unit_price),
        taxable: l.taxable,
        discount_amount: dollarsToCents(l.discount_amount),
      }));

    const body: Record<string, unknown> = {
      reason,
      scope_description: scopeDescription || undefined,
      customer_name: customerName,
      customer_email: customerEmail || undefined,
      tax_rate: (Number.parseFloat(taxRatePct) || 0) / 100,
      schedule_impact_days: scheduleImpactDays ? Number.parseInt(scheduleImpactDays, 10) : undefined,
      schedule_impact_note: scheduleImpactNote || undefined,
      blocks_closeout: blocksCloseout,
      customer_notes: customerNotes || undefined,
      internal_notes: internalNotes || undefined,
      line_items: payloadLines,
    };
    if (isEdit) body.version = changeOrder!.version;

    try {
      const res = await fetch(isEdit ? `/api/change-orders/${changeOrder!.id}` : `/api/work-orders/${workOrderId}/change-orders`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { data?: ChangeOrder; error?: string };
      if (!res.ok || !json.data) {
        setError(json.error ?? "Failed to save change order");
        setSaving(false);
        return;
      }
      onSaved(json.data);
    } catch {
      setError("Network error — please try again");
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400";
  const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {/* Details */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="co-reason" className={labelClass}>Reason *</label>
            <textarea id="co-reason" required minLength={5} maxLength={2000} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. Customer requested an additional filter replacement discovered during service" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="co-scope" className={labelClass}>Scope Description</label>
            <textarea id="co-scope" rows={2} maxLength={5000} value={scopeDescription ?? ""} onChange={(e) => setScopeDescription(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="co-cust" className={labelClass}>Customer Name *</label>
            <input id="co-cust" required maxLength={200} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
            <p className="mt-1 text-[11px] text-slate-400">Resolved from the job&apos;s property on save.</p>
          </div>
          <div>
            <label htmlFor="co-email" className={labelClass}>Customer Email</label>
            <input id="co-email" type="email" value={customerEmail ?? ""} onChange={(e) => setCustomerEmail(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Line Items</h3>
          <button type="button" onClick={() => setLines((p) => [...p, emptyLine()])} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <Plus className="h-3.5 w-3.5" /> Add Line
          </button>
        </div>
        <div className="space-y-3">
          {lines.map((line, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <input placeholder="Item name" value={line.name} onChange={(e) => updateLine(i, { name: e.target.value })} className={`${inputClass} sm:col-span-4`} />
                <input placeholder="Qty" type="number" step="0.001" min="0" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} className={`${inputClass} sm:col-span-2`} />
                <input placeholder="Unit" value={line.unit} onChange={(e) => updateLine(i, { unit: e.target.value })} className={`${inputClass} sm:col-span-2`} />
                <input placeholder="Price $" type="number" step="0.01" min="0" value={line.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} className={`${inputClass} sm:col-span-3`} />
                <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 sm:col-span-1" aria-label="Remove line">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-slate-500">
                  <input type="checkbox" checked={line.taxable} onChange={(e) => updateLine(i, { taxable: e.target.checked })} className="h-3.5 w-3.5 rounded border-border text-brand-600" />
                  Taxable
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Impact + content */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="co-tax" className={labelClass}>Tax Rate (%)</label>
            <input id="co-tax" type="number" step="0.001" min="0" max="100" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="co-sched" className={labelClass}>Schedule Impact (days)</label>
            <input id="co-sched" type="number" step="1" min="0" value={scheduleImpactDays} onChange={(e) => setScheduleImpactDays(e.target.value)} className={inputClass} placeholder="0" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="co-sched-note" className={labelClass}>Schedule Impact Note</label>
            <input id="co-sched-note" maxLength={2000} value={scheduleImpactNote ?? ""} onChange={(e) => setScheduleImpactNote(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={blocksCloseout} onChange={(e) => setBlocksCloseout(e.target.checked)} className="h-4 w-4 rounded border-border text-brand-600" />
              Blocks work-order closeout until resolved
            </label>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="co-cnotes" className={labelClass}>Customer Notes (shown on the customer link)</label>
            <textarea id="co-cnotes" rows={2} maxLength={5000} value={customerNotes ?? ""} onChange={(e) => setCustomerNotes(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="co-inotes" className={labelClass}>Internal Notes (staff only)</label>
            <textarea id="co-inotes" rows={2} maxLength={5000} value={internalNotes ?? ""} onChange={(e) => setInternalNotes(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button type="submit" disabled={saving || reason.trim().length < 5 || customerName.trim() === ""} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "Save Changes" : "Create Change Order"}
        </button>
      </div>
    </form>
  );
}
