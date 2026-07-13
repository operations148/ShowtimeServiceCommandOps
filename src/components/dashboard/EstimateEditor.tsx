"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type { Estimate, EstimateLineKind } from "@/types/estimate";

interface LineDraft {
  kind: EstimateLineKind;
  option_group: string;
  is_selected: boolean;
  name: string;
  description: string;
  unit: string;
  quantity: string;
  unit_price: string; // dollars
  taxable: boolean;
  discount_amount: string; // dollars
}

function emptyLine(): LineDraft {
  return { kind: "standard", option_group: "", is_selected: true, name: "", description: "", unit: "", quantity: "1", unit_price: "", taxable: true, discount_amount: "" };
}

function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Number((n * 100).toFixed(4)));
}

function centsToDollars(c: number): string {
  return (c / 100).toFixed(2);
}

export interface EstimateEditorProps {
  /** Present in edit mode; absent for create. */
  estimate?: Estimate;
  onSaved: (estimate: Estimate) => void;
  onCancel: () => void;
}

export function EstimateEditor({ estimate, onSaved, onCancel }: EstimateEditorProps) {
  const isEdit = !!estimate;
  const [title, setTitle] = useState(estimate?.title ?? "");
  const [customerName, setCustomerName] = useState(estimate?.customer_name ?? "");
  const [customerEmail, setCustomerEmail] = useState(estimate?.customer_email ?? "");
  const [customerPhone, setCustomerPhone] = useState(estimate?.customer_phone ?? "");
  const [customerAddress, setCustomerAddress] = useState(estimate?.customer_address ?? "");
  const [expiresAt, setExpiresAt] = useState(estimate?.expires_at ? estimate.expires_at.slice(0, 10) : "");
  const [taxRatePct, setTaxRatePct] = useState(estimate ? (estimate.tax_rate * 100).toString() : "0");
  const [discount, setDiscount] = useState(estimate ? centsToDollars(estimate.discount_amount) : "");
  const [customerNotes, setCustomerNotes] = useState(estimate?.customer_notes ?? "");
  const [internalNotes, setInternalNotes] = useState(estimate?.internal_notes ?? "");
  const [terms, setTerms] = useState(estimate?.terms ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    estimate?.line_items?.length
      ? estimate.line_items.map((l) => ({
          kind: l.kind,
          option_group: l.option_group ?? "",
          is_selected: l.is_selected,
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
        kind: l.kind,
        option_group: l.option_group || undefined,
        is_selected: l.is_selected,
        name: l.name.trim(),
        description: l.description || undefined,
        unit: l.unit || undefined,
        quantity: Number.parseFloat(l.quantity) || 0,
        unit_price: dollarsToCents(l.unit_price),
        taxable: l.taxable,
        discount_amount: dollarsToCents(l.discount_amount),
      }));

    const body: Record<string, unknown> = {
      title,
      customer_name: customerName,
      customer_email: customerEmail || undefined,
      customer_phone: customerPhone || undefined,
      customer_address: customerAddress || undefined,
      expires_at: expiresAt ? new Date(expiresAt + "T00:00:00Z").toISOString() : undefined,
      tax_rate: (Number.parseFloat(taxRatePct) || 0) / 100,
      discount_amount: dollarsToCents(discount),
      customer_notes: customerNotes || undefined,
      internal_notes: internalNotes || undefined,
      terms: terms || undefined,
      line_items: payloadLines,
    };
    if (isEdit) body.version = estimate!.version;

    try {
      const res = await fetch(isEdit ? `/api/estimates/${estimate!.id}` : "/api/estimates", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { data?: Estimate; error?: string };
      if (!res.ok || !json.data) {
        setError(json.error ?? "Failed to save estimate");
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
            <label htmlFor="est-title" className={labelClass}>Title *</label>
            <input id="est-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="est-cust" className={labelClass}>Customer Name *</label>
            <input id="est-cust" required maxLength={200} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="est-email" className={labelClass}>Customer Email</label>
            <input id="est-email" type="email" value={customerEmail ?? ""} onChange={(e) => setCustomerEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="est-phone" className={labelClass}>Phone</label>
            <input id="est-phone" value={customerPhone ?? ""} onChange={(e) => setCustomerPhone(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="est-expires" className={labelClass}>Expires</label>
            <input id="est-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="est-addr" className={labelClass}>Address</label>
            <input id="est-addr" maxLength={500} value={customerAddress ?? ""} onChange={(e) => setCustomerAddress(e.target.value)} className={inputClass} />
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
                <select value={line.kind} onChange={(e) => updateLine(i, { kind: e.target.value as EstimateLineKind })} className="rounded border border-border px-2 py-1 text-slate-600">
                  <option value="standard">Standard</option>
                  <option value="optional">Optional</option>
                  <option value="recommended">Recommended</option>
                </select>
                {line.kind !== "standard" && (
                  <input placeholder="Option group (optional)" value={line.option_group} onChange={(e) => updateLine(i, { option_group: e.target.value })} className="rounded border border-border px-2 py-1 text-slate-600" />
                )}
                <label className="flex items-center gap-1.5 text-slate-500">
                  <input type="checkbox" checked={line.taxable} onChange={(e) => updateLine(i, { taxable: e.target.checked })} className="h-3.5 w-3.5 rounded border-border text-brand-600" />
                  Taxable
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals + content */}
      <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="est-tax" className={labelClass}>Tax Rate (%)</label>
            <input id="est-tax" type="number" step="0.001" min="0" max="100" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="est-discount" className={labelClass}>Document Discount ($)</label>
            <input id="est-discount" type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="est-cnotes" className={labelClass}>Customer Notes (shown on proposal)</label>
            <textarea id="est-cnotes" rows={2} maxLength={5000} value={customerNotes ?? ""} onChange={(e) => setCustomerNotes(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="est-terms" className={labelClass}>Terms</label>
            <textarea id="est-terms" rows={2} maxLength={5000} value={terms ?? ""} onChange={(e) => setTerms(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="est-inotes" className={labelClass}>Internal Notes (staff only)</label>
            <textarea id="est-inotes" rows={2} maxLength={5000} value={internalNotes ?? ""} onChange={(e) => setInternalNotes(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button type="submit" disabled={saving || title.trim() === "" || customerName.trim() === ""} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "Save Changes" : "Create Estimate"}
        </button>
      </div>
    </form>
  );
}
