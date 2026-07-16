import { escapeHtml } from "@/lib/utils/escape-html";

/**
 * Portal magic-link email (Phase 7). Passwordless sign-in link. Every
 * interpolated value is escaped — company name, customer name, and the link
 * are all attacker-influenceable.
 */

export interface PortalMagicLinkEmailData {
  companyName: string;
  companyLogoUrl?: string | null;
  customerName: string;
  loginUrl: string;
  isInvite: boolean;
  expiresLabel: string; // e.g. "20 minutes" / "3 days"
}

export function buildPortalMagicLinkHtml(data: PortalMagicLinkEmailData): string {
  const company = escapeHtml(data.companyName);
  const firstName = escapeHtml(data.customerName.split(" ")[0] ?? data.customerName);
  const url = escapeHtml(data.loginUrl);
  const cta = data.isInvite ? "Set Up Your Account →" : "Sign In →";
  const lead = data.isInvite
    ? `${company} has set up a secure customer portal for you. Use the button below to sign in and see your estimates, invoices, and service history.`
    : `Use the button below to sign in to your ${company} customer portal.`;
  const logo = data.companyLogoUrl
    ? `<img src="${escapeHtml(data.companyLogoUrl)}" alt="${company}" style="max-height:40px;" />`
    : `<p style="margin:0;font-size:20px;font-weight:700;color:#FFFFFF;">${company}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Sign in to ${company}</title></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden;">
        <tr><td style="background:#0C1E2E;padding:24px 36px;">${logo}</td></tr>
        <tr><td style="padding:36px;">
          <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0F172A;">Hello ${firstName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#64748B;line-height:1.6;">${lead}</p>
          <table cellpadding="0" cellspacing="0" style="margin:8px 0;"><tr>
            <td style="background:#0066FF;border-radius:8px;">
              <a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">${cta}</a>
            </td>
          </tr></table>
          <p style="margin:20px 0 0;font-size:13px;color:#94A3B8;line-height:1.6;">
            This link expires in ${escapeHtml(data.expiresLabel)} and can be used once. If you didn't request it, you can safely ignore this email.
          </p>
          <p style="margin:14px 0 0;font-size:12px;color:#94A3B8;line-height:1.6;word-break:break-all;">
            Or paste this link into your browser: ${url}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildPortalMagicLinkText(data: Omit<PortalMagicLinkEmailData, "companyLogoUrl">): string {
  return [
    `${data.companyName} — ${data.isInvite ? "Set up your account" : "Sign in"}`,
    "",
    `Hello ${data.customerName.split(" ")[0] ?? data.customerName},`,
    "",
    data.isInvite
      ? `${data.companyName} has set up a secure customer portal for you.`
      : `Sign in to your ${data.companyName} customer portal:`,
    data.loginUrl,
    "",
    `This link expires in ${data.expiresLabel} and can be used once.`,
  ].join("\n");
}
