"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2, Send, Download, Ban, Link2, Copy, Check, Activity,
  DollarSign, RotateCcw, MinusCircle, CreditCard,
} from "lucide-react";
import { InvoiceStatus, type Invoice, type Payment, type InvoiceEvent } from "@/types/invoice";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { isEditable, isVoidable, isPayable } from "@/lib/invoices/state-machine";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/lib/utils";

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function when(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";
}
function label(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: "bg-slate-100 text-slate-600 border-slate-200",
  [InvoiceStatus.READY]: "bg-indigo-50 text-indigo-700 border-indigo-200",
  [InvoiceStatus.SENT]: "bg-blue-50 text-blue-700 border-blue-200",
  [InvoiceStatus.VIEWED]: "bg-cyan-50 text-cyan-700 border-cyan-200",
  [InvoiceStatus.DEPOSIT_DUE]: "bg-amber-50 text-amber-700 border-amber-200",
  [InvoiceStatus.DEPOSIT_PAID]: "bg-teal-50 text-teal-700 border-teal-200",
  [InvoiceStatus.PARTIALLY_PAID]: "bg-sky-50 text-sky-700 border-sky-200",
  [InvoiceStatus.PAID]: "bg-emerald-50 text-emerald-700 border-emerald-200",
  [InvoiceStatus.OVERDUE]: "bg-red-50 text-red-700 border-red-200",
  [InvoiceStatus.VOID]: "bg-slate-100 text-slate-400 border-slate-200",
  [InvoiceStatus.REFUNDED]: "bg-violet-50 text-violet-700 border-violet-200",
  [InvoiceStatus.CREDITED]: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
};

export function InvoiceDetailClient({ id }: { id: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const perms = role ? rolePermissions[role] : undefined;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [events, setEvents] = useState<InvoiceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${id}`);
      const json = (await res.json()) as { data?: Invoice; payments?: Payment[]; error?: string };
      if (!res.ok || !json.data) setError(json.error ?? "Failed to load invoice");
      else {
        setInvoice(json.data);
        setPayments(json.payments ?? []);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const loadActivity = useCallback(async () => {
    const ev = await fetch(`/api/invoices/${id}/activity`).then((r) => r.json()).catch(() => ({}));
    setEvents((ev as { data?: InvoiceEvent[] }).data ?? []);
  }, [id]);
  useEffect(() => { if (invoice) void loadActivity(); }, [invoice, loadActivity]);

  async function doAction(fn: () => Promise<void>) {
    setBusy(true); setActionErr(null); setActionMsg(null);
    try { await fn(); } finally { setBusy(false); }
  }

  async function handleSend() {
    if (!invoice) return;
    await doAction(async () => {
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: invoice.version }),
      });
      const json = (await res.json()) as { data?: { previewMode: boolean; delivered: boolean; publicUrl: string }; error?: string };
      if (!res.ok || !json.data) { setActionErr(json.error ?? "Failed to send"); return; }
      setPublicUrl(json.data.publicUrl);
      setActionMsg(json.data.previewMode ? "Preview mode — email not sent. Share the secure link below." : json.data.delivered ? "Invoice sent." : "Queued.");
      await load();
    });
  }

  async function handleTransitionReady() {
    if (!invoice) return;
    await doAction(async () => {
      const res = await fetch(`/api/invoices/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: invoice.version, to: "ready" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setActionErr(json.error ?? "Failed"); return; }
      await load();
    });
  }

  async function handleVoid() {
    if (!invoice) return;
    const reason = window.prompt("Reason for voiding this invoice (required, min 5 chars):");
    if (!reason || reason.trim().length < 5) { setActionErr("A reason of at least 5 characters is required."); return; }
    await doAction(async () => {
      const res = await fetch(`/api/invoices/${id}/void`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: invoice.version, reason }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setActionErr(json.error ?? "Failed to void"); return; }
      setActionMsg("Invoice voided.");
      await load();
    });
  }

  async function handleRecordPayment() {
    if (!invoice) return;
    const raw = window.prompt("Payment amount in dollars (offline payment — check/cash):", (invoice.amount_due / 100).toFixed(2));
    if (!raw) return;
    const amount = Math.round(Number.parseFloat(raw) * 100);
    if (!Number.isFinite(amount) || amount <= 0) { setActionErr("Enter a valid positive amount."); return; }
    const reference = window.prompt("Reference (check #, note) — optional:") ?? "";
    await doAction(async () => {
      const res = await fetch(`/api/invoices/${id}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reference: reference || undefined }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setActionErr(json.error ?? "Failed to record payment"); return; }
      setActionMsg("Payment recorded.");
      await load();
    });
  }

  async function handleRefund(payment: Payment) {
    const raw = window.prompt(`Refund amount in dollars (max ${(payment.amount / 100).toFixed(2)}):`, (payment.amount / 100).toFixed(2));
    if (!raw) return;
    const amount = Math.round(Number.parseFloat(raw) * 100);
    if (!Number.isFinite(amount) || amount <= 0) { setActionErr("Enter a valid positive amount."); return; }
    const reason = window.prompt("Reason for refund (required, min 5 chars):");
    if (!reason || reason.trim().length < 5) { setActionErr("A reason of at least 5 characters is required."); return; }
    await doAction(async () => {
      const res = await fetch(`/api/invoices/${id}/refund`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: payment.id, amount, reason }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setActionErr(json.error ?? "Failed to refund"); return; }
      setActionMsg("Refund recorded.");
      await load();
    });
  }

  async function handleCredit() {
    if (!invoice) return;
    const raw = window.prompt("Credit amount in dollars:", (invoice.amount_due / 100).toFixed(2));
    if (!raw) return;
    const amount = Math.round(Number.parseFloat(raw) * 100);
    if (!Number.isFinite(amount) || amount <= 0) { setActionErr("Enter a valid positive amount."); return; }
    const reason = window.prompt("Reason for credit (required, min 5 chars):");
    if (!reason || reason.trim().length < 5) { setActionErr("A reason of at least 5 characters is required."); return; }
    await doAction(async () => {
      const res = await fetch(`/api/invoices/${id}/credit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setActionErr(json.error ?? "Failed to apply credit"); return; }
      setActionMsg("Credit applied.");
      await load();
    });
  }

  async function handleCheckoutLink() {
    await doAction(async () => {
      const res = await fetch(`/api/invoices/${id}/checkout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_type: "balance" }),
      });
      const json = (await res.json()) as { data?: { checkoutUrl: string }; error?: string };
      if (!res.ok || !json.data) { setActionErr(json.error ?? "Failed to create link"); return; }
      setPublicUrl(json.data.checkoutUrl);
      setActionMsg("Stripe payment link created — share it with the customer.");
    });
  }

  function copyLink() {
    if (!publicUrl) return;
    void navigator.clipboard.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (error || !invoice) return <div className="mx-auto max-w-4xl"><ErrorState message={error ?? "Invoice not found"} onRetry={load} /></div>;

  const canManage = perms?.canManageInvoices ?? false;
  const canRefund = perms?.canRefundPayments ?? false;
  const canSend = perms?.canSendEstimateEmail ?? false;
  const editable = isEditable(invoice.status);
  const voidable = isVoidable(invoice.status);
  const payable = isPayable(invoice.status);
  const sendable = editable || invoice.status === InvoiceStatus.SENT || invoice.status === InvoiceStatus.VIEWED || invoice.status === InvoiceStatus.DEPOSIT_DUE || invoice.status === InvoiceStatus.PARTIALLY_PAID || invoice.status === InvoiceStatus.OVERDUE;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumb items={[{ label: "Invoices", href: "/dashboard/invoices" }, { label: invoice.invoice_number }]} className="mb-2" />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl font-bold text-slate-900">{invoice.title}</h2>
            <span className={cn("inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATUS_BADGE[invoice.status])}>{label(invoice.status)}</span>
            {invoice.invoice_kind !== "standard" && (
              <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{invoice.invoice_kind}</span>
            )}
          </div>
          <p className="mt-1 font-mono text-sm text-slate-500">{invoice.invoice_number} · {invoice.customer_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && invoice.status === InvoiceStatus.DRAFT && (
            <button type="button" onClick={handleTransitionReady} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50">
              Mark Ready
            </button>
          )}
          {canSend && sendable && (
            <button type="button" onClick={handleSend} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.READY ? "Send" : "Resend"}
            </button>
          )}
          {canManage && payable && (
            <button type="button" onClick={handleCheckoutLink} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 shadow-sm hover:bg-brand-100 disabled:opacity-50">
              <CreditCard className="h-4 w-4" /> Pay Link
            </button>
          )}
          <a href={`/api/invoices/${id}/pdf`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
            <Download className="h-4 w-4" /> PDF
          </a>
          {canManage && voidable && (
            <button type="button" onClick={handleVoid} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50">
              <Ban className="h-4 w-4" /> Void
            </button>
          )}
        </div>
      </div>

      {actionMsg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{actionMsg}</div>}
      {actionErr && <ErrorState message={actionErr} />}

      {/* Public / payment link */}
      {publicUrl && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
          <Link2 className="h-4 w-4 shrink-0 text-brand-600" />
          <input readOnly value={publicUrl} className="min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-600 focus:outline-none" />
          <button type="button" onClick={copyLink} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold text-brand-700 shadow-sm hover:bg-brand-100">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {/* Line items + totals */}
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3">Item</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(invoice.line_items ?? []).map((line) => (
              <tr key={line.id}>
                <td className="px-5 py-3">
                  <span className="font-medium text-slate-900">{line.description}</span>
                  {line.details && <p className="mt-0.5 text-xs text-slate-400">{line.details}</p>}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{line.quantity}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-600">{money(line.unit_price)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{money(line.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t border-border p-4 text-sm">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono">{money(invoice.subtotal)}</span></div>
          {invoice.discount_amount > 0 && <div className="flex justify-between text-slate-500"><span>Discount</span><span className="font-mono">−{money(invoice.discount_amount)}</span></div>}
          <div className="flex justify-between text-slate-500"><span>Tax ({(invoice.tax_rate * 100).toFixed(2)}%)</span><span className="font-mono">{money(invoice.tax_amount)}</span></div>
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold text-slate-900"><span>Total</span><span className="font-mono">{money(invoice.total)}</span></div>
          <div className="flex justify-between text-emerald-600"><span>Paid</span><span className="font-mono">{money(invoice.amount_paid)}</span></div>
          {invoice.amount_refunded > 0 && <div className="flex justify-between text-violet-600"><span>Refunded</span><span className="font-mono">{money(invoice.amount_refunded)}</span></div>}
          {invoice.credited_amount > 0 && <div className="flex justify-between text-fuchsia-600"><span>Credited</span><span className="font-mono">{money(invoice.credited_amount)}</span></div>}
          <div className={cn("flex justify-between pt-1 text-base font-bold", invoice.amount_due > 0 ? "text-red-600" : "text-emerald-600")}><span>Amount Due</span><span className="font-mono">{money(invoice.amount_due)}</span></div>
        </div>
      </div>

      {/* Ledger actions */}
      {(canManage || canRefund) && invoice.status !== InvoiceStatus.VOID && (
        <div className="flex flex-wrap gap-2">
          {canManage && payable && (
            <button type="button" onClick={handleRecordPayment} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50">
              <DollarSign className="h-4 w-4" /> Record Payment
            </button>
          )}
          {canManage && invoice.amount_due > 0 && (
            <button type="button" onClick={handleCredit} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50">
              <MinusCircle className="h-4 w-4" /> Apply Credit
            </button>
          )}
        </div>
      )}

      {/* Payments ledger */}
      <div className="rounded-xl border border-border bg-white shadow-sm">
        <div className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Payment Ledger</div>
        {payments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <span className={cn("font-medium", p.kind === "refund" ? "text-violet-700" : p.kind === "credit" ? "text-fuchsia-700" : "text-slate-800")}>
                    {label(p.kind)} · {money(p.amount)}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">{p.provider} · {when(p.created_at)}</span>
                  {p.status !== "succeeded" && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{p.status}</span>}
                </div>
                {canRefund && p.kind === "payment" && p.status === "succeeded" && (
                  <button type="button" onClick={() => handleRefund(p)} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    <RotateCcw className="h-3.5 w-3.5" /> Refund
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Activity */}
      <div>
        <div className="mb-3 flex items-center gap-2 border-b border-border pb-2 text-sm font-semibold text-slate-700">
          <Activity className="h-4 w-4" /> Activity
        </div>
        <ul className="space-y-2">
          {events.length === 0 && <li className="text-sm text-slate-400">No activity yet.</li>}
          {events.map((ev) => (
            <li key={ev.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white px-4 py-2.5 text-sm">
              <div>
                <span className="font-medium text-slate-700">{ev.event_type.replace(/_/g, " ")}</span>
                {ev.actor_name && <span className="text-slate-400"> · {ev.actor_name}</span>}
                {ev.recipient_email && <span className="text-slate-400"> · {ev.recipient_email}</span>}
                {ev.preview_mode && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">preview</span>}
                {ev.error_detail && <p className="text-xs text-red-500">{ev.error_detail}</p>}
              </div>
              <span className="shrink-0 text-xs text-slate-400">{when(ev.created_at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
