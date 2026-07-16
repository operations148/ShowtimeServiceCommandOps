"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, CreditCard } from "lucide-react";
import type { PublicInvoice } from "@/types/invoice";

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function label(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type LoadState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; invoice: PublicInvoice };

export function PublicInvoiceClient({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const paidReturn = searchParams.get("status") === "paid";
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/public/invoices/${encodeURIComponent(token)}`);
        const json = (await res.json()) as { data?: PublicInvoice; error?: string };
        if (!active) return;
        if (!res.ok || !json.data) {
          setState({ phase: "error", message: json.error ?? "This invoice is unavailable." });
          return;
        }
        setState({ phase: "ready", invoice: json.data });
      } catch {
        if (active) setState({ phase: "error", message: "This invoice is unavailable." });
      }
    })();
    return () => { active = false; };
  }, [token]);

  async function pay(paymentType: "deposit" | "balance") {
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch(`/api/public/invoices/${encodeURIComponent(token)}/pay`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_type: paymentType }),
      });
      const json = (await res.json()) as { data?: { checkoutUrl: string }; error?: string };
      if (!res.ok || !json.data) { setPayError(json.error ?? "Unable to start payment."); setPaying(false); return; }
      window.location.href = json.data.checkoutUrl;
    } catch {
      setPayError("Something went wrong. Please try again.");
      setPaying(false);
    }
  }

  if (state.phase === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }
  if (state.phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <XCircle className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-600">{state.message}</p>
        </div>
      </div>
    );
  }

  const inv = state.invoice;
  const settled = inv.amount_due <= 0 || inv.status === "paid" || inv.status === "void" || inv.status === "refunded" || inv.status === "credited";
  const depositOutstanding = Math.max(0, inv.deposit_amount - Math.max(0, inv.amount_paid - inv.amount_refunded));
  const showDeposit = inv.deposit_required && depositOutstanding > 0 && depositOutstanding < inv.amount_due;

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <header className="bg-[#0C1E2E] px-5 py-6">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          {inv.company_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inv.company_logo_url} alt={inv.company_name} className="h-9 max-w-[160px] object-contain" />
          ) : (
            <p className="text-lg font-semibold text-white">{inv.company_name}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5">
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice {inv.invoice_number}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">{inv.title}</h1>
          {inv.milestone_label && <p className="mt-0.5 text-sm text-slate-500">{inv.milestone_label}</p>}
          <p className="mt-1 text-sm text-slate-500">Billed to {inv.customer_name}</p>
          <p className="mt-2 text-xs font-medium text-slate-400">
            Issued {inv.issue_date}{inv.due_date ? ` · Due ${inv.due_date}` : ""} · {label(inv.status)}
          </p>
        </div>

        {(paidReturn || settled) && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-800">{inv.amount_due <= 0 ? "This invoice is paid in full." : "Thank you — your payment is processing."}</p>
              {inv.amount_due > 0 && <p className="text-sm text-emerald-700">It may take a moment to update.</p>}
            </div>
          </div>
        )}

        {/* Line items */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {inv.line_items.map((line) => (
              <div key={line.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{line.description}</p>
                  {line.details && <p className="mt-0.5 text-sm text-slate-500">{line.details}</p>}
                  <p className="mt-1 text-xs text-slate-400">{line.quantity} × {money(line.unit_price)}</p>
                </div>
                <p className="shrink-0 font-mono text-sm font-semibold text-slate-900">{money(line.total)}</p>
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

        {/* Payment history */}
        {inv.payments.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
            <p className="mb-2 font-semibold text-slate-700">Payment History</p>
            <ul className="space-y-1">
              {inv.payments.map((p, i) => (
                <li key={i} className="flex justify-between text-slate-500">
                  <span>{new Date(p.created_at).toLocaleDateString("en-US")} · {label(p.kind)}</span>
                  <span className="font-mono">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {inv.payment_instructions && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            <p className="mb-1 font-semibold text-slate-700">Payment Instructions</p>
            <p className="whitespace-pre-line">{inv.payment_instructions}</p>
          </div>
        )}
        {inv.notes && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
            <p className="mb-1 font-semibold text-slate-700">Notes</p>
            <p className="whitespace-pre-line">{inv.notes}</p>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Secure invoice from {inv.company_name}
        </p>
      </main>

      {/* Pay action bar */}
      {!settled && inv.can_pay_online && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            {payError && <p className="mb-2 text-center text-sm text-red-600">{payError}</p>}
            <div className="flex gap-3">
              {showDeposit && (
                <button type="button" onClick={() => pay("deposit")} disabled={paying} className="min-h-[48px] flex-1 rounded-xl border border-brand-300 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-50">
                  Pay Deposit {money(depositOutstanding)}
                </button>
              )}
              <button type="button" onClick={() => pay("balance")} disabled={paying} className="inline-flex min-h-[48px] flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50">
                {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Pay {money(inv.amount_due)}
              </button>
            </div>
          </div>
        </div>
      )}
      {!settled && !inv.can_pay_online && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-4 text-center text-sm text-slate-500 backdrop-blur">
          Please use the payment instructions above or contact {inv.company_name} to pay.
        </div>
      )}
    </div>
  );
}
