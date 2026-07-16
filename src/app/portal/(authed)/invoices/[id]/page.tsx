"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, XCircle, CheckCircle2, Download, CreditCard } from "lucide-react";
import { type PublicInvoice, InvoiceStatus } from "@/types/invoice";
import { money, statusLabel } from "@/components/portal/PortalShell";

export default function PortalInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  // Read the ?status=paid return flag from the URL directly (client-only) so the
  // page doesn't need a Suspense boundary around useSearchParams at prerender.
  const [paidReturn, setPaidReturn] = useState(false);
  const [inv, setInv] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    setPaidReturn(new URLSearchParams(window.location.search).get("status") === "paid");
  }, []);

  useEffect(() => {
    fetch(`/api/portal/invoices/${id}`).then(async (r) => {
      const j = (await r.json()) as { data?: PublicInvoice; error?: string };
      if (!r.ok || !j.data) { setError(j.error ?? "Invoice not found"); return; }
      setInv(j.data);
    }).finally(() => setLoading(false));
  }, [id]);

  async function pay(paymentType: "deposit" | "balance") {
    setPaying(true); setPayError(null);
    try {
      const res = await fetch(`/api/portal/invoices/${id}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_type: paymentType }) });
      const j = (await res.json()) as { data?: { checkoutUrl: string }; error?: string };
      if (!res.ok || !j.data) { setPayError(j.error ?? "Unable to start payment."); setPaying(false); return; }
      window.location.href = j.data.checkoutUrl;
    } catch { setPayError("Something went wrong."); setPaying(false); }
  }

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (error || !inv) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><XCircle className="mx-auto mb-2 h-7 w-7 text-slate-300" /><p className="text-sm text-slate-600">{error ?? "Not found"}</p></div>;

  const settled = inv.amount_due <= 0 || inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.VOID || inv.status === InvoiceStatus.REFUNDED || inv.status === InvoiceStatus.CREDITED;
  const netPaid = Math.max(0, inv.amount_paid - inv.amount_refunded);
  const depositOutstanding = Math.max(0, inv.deposit_amount - netPaid);
  const showDeposit = inv.deposit_required && depositOutstanding > 0 && depositOutstanding < inv.amount_due;

  return (
    <div className="space-y-5 pb-28">
      <button type="button" onClick={() => router.push("/portal/invoices")} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" /> Invoices</button>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice {inv.invoice_number}</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">{inv.title}</h1>
            <p className="mt-1 text-xs font-medium text-slate-400">Issued {inv.issue_date}{inv.due_date ? ` · Due ${inv.due_date}` : ""} · {statusLabel(inv.status)}</p>
          </div>
          <a href={`/api/portal/invoices/${id}/pdf`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Download className="h-3.5 w-3.5" /> PDF</a>
        </div>
      </div>

      {(paidReturn || settled) && <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><CheckCircle2 className="h-6 w-6 text-emerald-600" /><p className="font-semibold text-emerald-800">{inv.amount_due <= 0 ? "This invoice is paid in full." : "Thank you — your payment is processing."}</p></div>}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100">
          {inv.line_items.map((l) => (
            <div key={l.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0"><p className="font-medium text-slate-900">{l.description}</p>{l.details && <p className="mt-0.5 text-sm text-slate-500">{l.details}</p>}<p className="mt-1 text-xs text-slate-400">{l.quantity} × {money(l.unit_price)}</p></div>
              <p className="shrink-0 font-mono text-sm font-semibold text-slate-900">{money(l.total)}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 border-t border-slate-200 p-4 text-sm">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono">{money(inv.subtotal)}</span></div>
          {inv.discount_amount > 0 && <div className="flex justify-between text-slate-500"><span>Discount</span><span className="font-mono">−{money(inv.discount_amount)}</span></div>}
          <div className="flex justify-between text-slate-500"><span>Tax</span><span className="font-mono">{money(inv.tax_amount)}</span></div>
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-900"><span>Total</span><span className="font-mono">{money(inv.total)}</span></div>
          {inv.amount_paid > 0 && <div className="flex justify-between text-emerald-600"><span>Paid</span><span className="font-mono">{money(inv.amount_paid)}</span></div>}
          <div className="flex justify-between text-base font-bold text-slate-900"><span>Amount Due</span><span className="font-mono">{money(inv.amount_due)}</span></div>
        </div>
      </div>

      {inv.payments.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
          <p className="mb-2 font-semibold text-slate-700">Payment History</p>
          <ul className="space-y-1">{inv.payments.map((p, i) => <li key={i} className="flex justify-between text-slate-500"><span>{new Date(p.created_at).toLocaleDateString("en-US")} · {statusLabel(p.kind)}</span><span className="font-mono">{money(p.amount)}</span></li>)}</ul>
        </div>
      )}

      {inv.payment_instructions && <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm"><p className="mb-1 font-semibold text-slate-700">Payment Instructions</p><p className="whitespace-pre-line">{inv.payment_instructions}</p></div>}

      {!settled && inv.can_pay_online && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur lg:left-64">
          <div className="mx-auto max-w-4xl">
            {payError && <p className="mb-2 text-center text-sm text-red-600">{payError}</p>}
            <div className="flex gap-3">
              {showDeposit && <button type="button" onClick={() => pay("deposit")} disabled={paying} className="min-h-[48px] flex-1 rounded-xl border border-brand-300 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">Pay Deposit {money(depositOutstanding)}</button>}
              <button type="button" onClick={() => pay("balance")} disabled={paying} className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}Pay {money(inv.amount_due)}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
