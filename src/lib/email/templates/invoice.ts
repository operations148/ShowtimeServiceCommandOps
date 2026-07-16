import { escapeHtml } from "@/lib/utils/escape-html";
import { formatCents } from "@/lib/money/money";

/**
 * Invoice email (Phase 6, mirrors change-order.ts / estimate-proposal.ts).
 * Every interpolated value is escaped via escapeHtml — the customer name,
 * company name, title, and the public link are all attacker-influenceable.
 */

export interface InvoiceEmailData {
  companyName: string;
  companyLogoUrl?: string | null;
  invoiceNumber: string;
  title: string;
  customerName: string;
  amountDueCents: number;
  dueDate?: string | null;
  publicUrl: string;
  canPayOnline: boolean;
}

export function buildInvoiceEmailHtml(data: InvoiceEmailData): string {
  const company = escapeHtml(data.companyName);
  const firstName = escapeHtml(data.customerName.split(" ")[0] ?? data.customerName);
  const amountDue = escapeHtml(formatCents(data.amountDueCents));
  const number = escapeHtml(data.invoiceNumber);
  const title = escapeHtml(data.title);
  const url = escapeHtml(data.publicUrl);
  const due = data.dueDate ? escapeHtml(data.dueDate) : null;
  const cta = data.canPayOnline ? "View &amp; Pay Invoice →" : "View Invoice →";
  const logo = data.companyLogoUrl
    ? `<img src="${escapeHtml(data.companyLogoUrl)}" alt="${company}" style="max-height:40px;" />`
    : `<p style="margin:0;font-size:20px;font-weight:700;color:#FFFFFF;">${company}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Invoice from ${company}</title></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">
        <tr><td style="background:#0C1E2E;padding:24px 36px;">${logo}</td></tr>
        <tr><td style="padding:36px;">
          <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0F172A;">Your invoice is ready, ${firstName}</p>
          <p style="margin:0 0 20px;font-size:15px;color:#64748B;line-height:1.6;">
            ${company} has issued invoice <strong>${number}</strong> — ${title}.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 8px;"><tr>
            <td style="font-size:14px;color:#64748B;padding-right:12px;">Amount due</td>
            <td style="font-size:20px;font-weight:700;color:#0F172A;">${amountDue}</td>
          </tr></table>
          ${due ? `<p style="margin:0 0 24px;font-size:14px;color:#475569;">Due by ${due}</p>` : ""}
          <table cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr>
            <td style="background:#0066FF;border-radius:8px;">
              <a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">
                ${cta}
              </a>
            </td>
          </tr></table>
          <p style="margin:20px 0 0;font-size:12px;color:#94A3B8;line-height:1.6;word-break:break-all;">
            Or paste this link into your browser: ${url}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildInvoiceEmailText(data: Omit<InvoiceEmailData, "companyLogoUrl" | "canPayOnline">): string {
  const lines = [
    `${data.companyName} — Invoice ${data.invoiceNumber}`,
    "",
    `Hello ${data.customerName.split(" ")[0] ?? data.customerName},`,
    "",
    `Your invoice is ready: ${data.title}`,
    `Amount due: ${formatCents(data.amountDueCents)}`,
    ...(data.dueDate ? [`Due by: ${data.dueDate}`] : []),
    "",
    "View your invoice:",
    data.publicUrl,
  ];
  return lines.join("\n");
}
