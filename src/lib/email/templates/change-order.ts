import { escapeHtml } from "@/lib/utils/escape-html";
import { formatCents } from "@/lib/money/money";

/**
 * Change-order email (Phase 5, mirrors estimate-proposal.ts). Every
 * interpolated value is escaped via escapeHtml — the customer name, company
 * name, reason, and the public link are all attacker-influenceable.
 */

export interface ChangeOrderEmailData {
  companyName: string;
  companyLogoUrl?: string | null;
  changeOrderNumber: string;
  reason: string;
  customerName: string;
  totalImpactCents: number;
  publicUrl: string;
  customerNotes?: string | null;
}

export function buildChangeOrderEmailHtml(data: ChangeOrderEmailData): string {
  const company = escapeHtml(data.companyName);
  const firstName = escapeHtml(data.customerName.split(" ")[0] ?? data.customerName);
  const total = escapeHtml(formatCents(data.totalImpactCents));
  const number = escapeHtml(data.changeOrderNumber);
  const reason = escapeHtml(data.reason);
  const url = escapeHtml(data.publicUrl);
  const notes = data.customerNotes ? escapeHtml(data.customerNotes) : null;
  const logo = data.companyLogoUrl
    ? `<img src="${escapeHtml(data.companyLogoUrl)}" alt="${company}" style="max-height:40px;" />`
    : `<p style="margin:0;font-size:20px;font-weight:700;color:#FFFFFF;">${company}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Change order from ${company}</title></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">
        <tr><td style="background:#0C1E2E;padding:24px 36px;">${logo}</td></tr>
        <tr><td style="padding:36px;">
          <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0F172A;">A change order needs your approval, ${firstName}</p>
          <p style="margin:0 0 20px;font-size:15px;color:#64748B;line-height:1.6;">
            ${company} has prepared change order <strong>${number}</strong> for your project: ${reason}
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 8px;"><tr>
            <td style="font-size:14px;color:#64748B;padding-right:12px;">Total impact</td>
            <td style="font-size:20px;font-weight:700;color:#0F172A;">${total}</td>
          </tr></table>
          ${notes ? `<p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;background:#F1F5F9;border-radius:8px;padding:14px 16px;">${notes}</p>` : ""}
          <table cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr>
            <td style="background:#0066FF;border-radius:8px;">
              <a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">
                View &amp; Respond to Change Order →
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

export function buildChangeOrderEmailText(data: Omit<ChangeOrderEmailData, "companyLogoUrl" | "customerNotes">): string {
  const lines = [
    `${data.companyName} — Change Order ${data.changeOrderNumber}`,
    "",
    `Hello ${data.customerName.split(" ")[0] ?? data.customerName},`,
    "",
    `A change order needs your approval: ${data.reason}`,
    `Total impact: ${formatCents(data.totalImpactCents)}`,
    "",
    "View and respond to your change order:",
    data.publicUrl,
  ];
  return lines.join("\n");
}
