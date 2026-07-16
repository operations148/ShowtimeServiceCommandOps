import { db } from "@/lib/db/client";
import { InvoiceStatus } from "@/types/invoice";
import {
  getInvoiceById,
  getInvoiceLines,
  issueInvoiceToken,
  recordInvoiceEvent,
} from "@/lib/db/queries/invoices";
import { canTransition } from "@/lib/invoices/state-machine";
import { canAcceptPayments } from "@/lib/stripe/connect";
import { safeSend } from "@/lib/email/safe-mailer";
import { buildInvoiceEmailHtml, buildInvoiceEmailText } from "@/lib/email/templates/invoice";
import type { TenantRow } from "@/lib/db/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "https://serviceops-ghl-workorders.vercel.app";

export type SendInvoiceResult =
  | { ok: true; delivered: boolean; previewMode: boolean; testOverride: boolean; publicUrl: string }
  | { ok: false; reason: "not_found" | "stale_version" | "invalid_state" | "no_recipient" | "send_failed"; detail?: string };

interface TenantBrandingRow {
  name: string;
  logo_url: string | null;
  business_phone: string | null;
  business_email: string | null;
}

/**
 * Manual invoice send (Phase 6, mirrors src/lib/change-orders/send.ts).
 * Freezes a fresh hashed public token, moves draft/ready → sent (resend keeps
 * the current live status), and delivers via the safe mailer (preview by
 * default; real customer sending remains an approval gate via ESTIMATE_EMAIL_MODE).
 */
export async function sendInvoice(
  invoiceId: string,
  tenantId: string,
  input: { version: number; recipientEmail?: string; expiresInDays: number },
  actor: { userId: string; name?: string | null }
): Promise<SendInvoiceResult> {
  const invoice = await getInvoiceById(invoiceId, tenantId);
  if (!invoice) return { ok: false, reason: "not_found" };
  if (invoice.version !== input.version) return { ok: false, reason: "stale_version" };

  const alreadyLive =
    invoice.status === InvoiceStatus.SENT ||
    invoice.status === InvoiceStatus.VIEWED ||
    invoice.status === InvoiceStatus.DEPOSIT_DUE ||
    invoice.status === InvoiceStatus.PARTIALLY_PAID ||
    invoice.status === InvoiceStatus.OVERDUE;
  if (!alreadyLive && !canTransition(invoice.status, InvoiceStatus.SENT)) {
    return { ok: false, reason: "invalid_state", detail: `cannot send from ${invoice.status}` };
  }

  const recipient = input.recipientEmail ?? invoice.customer_email ?? undefined;
  if (!recipient) return { ok: false, reason: "no_recipient" };

  // Issue a fresh hashed token (also clears any prior revocation).
  const tokenResult = await issueInvoiceToken(invoiceId, tenantId, input.expiresInDays);
  if (!tokenResult) return { ok: false, reason: "not_found" };

  // Move to SENT on first send; a resend of an already-live invoice keeps its
  // current status (never regresses partially_paid/overdue back to sent).
  if (!alreadyLive) {
    await db
      .from("invoices")
      .update({ status: InvoiceStatus.SENT, sent_at: invoice.sent_at ?? new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId);
  } else if (!invoice.sent_at) {
    await db.from("invoices").update({ sent_at: new Date().toISOString() }).eq("id", invoiceId).eq("tenant_id", tenantId);
  }

  const { data: tenantRow } = await db
    .from("tenants")
    .select("name, logo_url, business_phone, business_email, stripe_account_id, stripe_charges_enabled")
    .eq("id", tenantId)
    .maybeSingle();
  const branding = (tenantRow ?? { name: "ServiceOps", logo_url: null, business_phone: null, business_email: null }) as TenantBrandingRow;
  const canPay = canAcceptPayments((tenantRow ?? {}) as TenantRow);

  // Snapshot the sent line items into the immutable source_snapshot slot is not
  // needed here (invoices already snapshot at creation); we only refresh totals
  // display via the email.
  await getInvoiceLines(invoiceId, tenantId);

  const publicUrl = `${APP_URL}/invoice/${tokenResult.token}`;

  const result = await safeSend({
    to: recipient,
    subject: `Invoice ${invoice.invoice_number} from ${branding.name}`,
    html: buildInvoiceEmailHtml({
      companyName: branding.name,
      companyLogoUrl: branding.logo_url,
      invoiceNumber: invoice.invoice_number,
      title: invoice.title,
      customerName: invoice.customer_name,
      amountDueCents: invoice.amount_due,
      dueDate: invoice.due_date ?? null,
      publicUrl,
      canPayOnline: canPay,
    }),
    text: buildInvoiceEmailText({
      companyName: branding.name,
      invoiceNumber: invoice.invoice_number,
      title: invoice.title,
      customerName: invoice.customer_name,
      amountDueCents: invoice.amount_due,
      dueDate: invoice.due_date ?? null,
      publicUrl,
    }),
  });

  const delivered = result.delivered;
  await recordInvoiceEvent({
    invoiceId,
    tenantId,
    eventType: delivered || result.previewMode ? "sent" : "send_failed",
    actorUserId: actor.userId,
    actorName: actor.name ?? undefined,
    recipientEmail: recipient,
    previewMode: result.previewMode,
    testOverride: "testOverride" in result ? result.testOverride : false,
    providerMessageId: "providerMessageId" in result ? result.providerMessageId : undefined,
    errorDetail: "error" in result ? result.error : undefined,
  });

  if (!delivered && !result.previewMode) {
    return { ok: false, reason: "send_failed", detail: "error" in result ? result.error : "unknown" };
  }

  return {
    ok: true,
    delivered,
    previewMode: result.previewMode,
    testOverride: "testOverride" in result ? result.testOverride : false,
    publicUrl,
  };
}
