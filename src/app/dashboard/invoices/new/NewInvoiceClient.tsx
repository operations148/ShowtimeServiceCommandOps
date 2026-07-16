"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type { Invoice } from "@/types/invoice";
import { Breadcrumb } from "@/components/layout/Breadcrumb";

interface LineDraft {
  description: string;
  details: string;
  quantity: string;
  unit_price: string; // dollars
}

function emptyLine(): LineDraft {
  return { description: "", details: "", quantity: "1", unit_price: "" };
}
function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(Number((n * 100).toFixed(4)));
}

export function NewInvoiceClient() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taxRatePct, setTaxRatePct] = useState("0");
  const [discount, setDiscount] = useState("");
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositPercent, setDepositPercent] = useState("10");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
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
      .filter((l) => l.description.trim() !== "")
      .map((l) => ({
        description: l.description.trim(),
        details: l.details || undefined,
        quantity: Number.parseFloat(l.quantity) || 0,
        unit_price: dollarsToCents(l.unit_price),
      }));

    if (payloadLines.length === 0) { setError("Add at least one line item."); setSaving(false); return; }

    const body = {
      title,
      customer_name: customerName,
      customer_email: customerEmail || undefined,
      customer_address: customerAddress || undefined,
      due_date: dueDate || undefined,
      tax_rate: (Number.parseFloat(taxRatePct) || 0) / 100,
      discount_amount: dollarsToCents(discount),
      deposit_required: depositRequired,
      deposit_percent: Number.parseFloat(depositPercent) || 10,
      notes: notes || undefined,
      terms: terms || undefined,
      payment_instructions: paymentInstructions || undefined,
      line_items: payloadLines,
    };

    try {
      const res = await fetch("/api/invoices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { data?: Invoice; error?: string };
      if (!res.ok || !json.data) { setError(json.error ?? "Failed to create invoice"); setSaving(false); return; }
      router.push(`/dashboard/invoices/${json.data.id}`);
    } catch {
      setError("Network error — please try again");
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400";
  const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Invoices", href: "/dashboard/invoices" }, { label: "New" }]} className="mb-2" />
        <h2 className="font-display text-2xl font-bold text-slate-900">New Invoice</h2>
        <p className="mt-1 text-sm text-slate-500">Totals are computed on the server from the lines you enter.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

        {/* Details */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="inv-title" className={labelClass}>Title *</label>
              <input id="inv-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="inv-cust" className={labelClass}>Customer Name *</label>
              <input id="inv-cust" required maxLength={200} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="inv-email" className={labelClass}>Customer Email</label>
              <input id="inv-email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="inv-due" className={labelClass}>Due Date</label>
              <input id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="inv-addr" className={labelClass}>Address</label>
              <input id="inv-addr" maxLength={500} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} className={inputClass} />
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
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <input placeholder="Description" value={line.description} onChange={(e) => updateLine(i, { description: e.target.value })} className={`${inputClass} sm:col-span-5`} />
                <input placeholder="Qty" type="number" step="0.001" min="0" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} className={`${inputClass} sm:col-span-2`} />
                <input placeholder="Unit price $" type="number" step="0.01" min="0" value={line.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} className={`${inputClass} sm:col-span-4`} />
                <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 sm:col-span-1" aria-label="Remove line">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Totals + content */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="inv-tax" className={labelClass}>Tax Rate (%)</label>
              <input id="inv-tax" type="number" step="0.001" min="0" max="100" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="inv-discount" className={labelClass}>Document Discount ($)</label>
              <input id="inv-discount" type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={depositRequired} onChange={(e) => setDepositRequired(e.target.checked)} className="h-4 w-4 rounded border-border text-brand-600" />
                Require a deposit
              </label>
            </div>
            {depositRequired && (
              <div>
                <label htmlFor="inv-deposit" className={labelClass}>Deposit (%)</label>
                <input id="inv-deposit" type="number" step="1" min="10" max="100" value={depositPercent} onChange={(e) => setDepositPercent(e.target.value)} className={inputClass} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="inv-notes" className={labelClass}>Notes (shown to customer)</label>
              <textarea id="inv-notes" rows={2} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="inv-pay" className={labelClass}>Payment Instructions</label>
              <textarea id="inv-pay" rows={2} maxLength={2000} value={paymentInstructions} onChange={(e) => setPaymentInstructions(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="inv-terms" className={labelClass}>Terms</label>
              <textarea id="inv-terms" rows={2} maxLength={5000} value={terms} onChange={(e) => setTerms(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.push("/dashboard/invoices")} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving || title.trim() === "" || customerName.trim() === ""} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Invoice
          </button>
        </div>
      </form>
    </div>
  );
}
