import { createMagicLink } from "@/lib/portal/magic-link";
import { getPortalBranding } from "@/lib/db/queries/portal-data";
import { safeSend } from "@/lib/email/safe-mailer";
import { buildPortalMagicLinkHtml, buildPortalMagicLinkText } from "@/lib/email/templates/portal-magic-link";
import type { PortalCustomer, PortalMagicLinkPurpose } from "@/types/portal";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "https://serviceops-ghl-workorders.vercel.app";

/**
 * Creates a magic link for a portal customer and sends the branded sign-in
 * email via the safe mailer (preview by default — real customer email is the
 * same approval gate as estimates/invoices via ESTIMATE_EMAIL_MODE).
 * Returns whether it was delivered; callers must NOT vary their HTTP response
 * on this (no email-enumeration oracle).
 */
export async function sendPortalMagicLink(
  customer: PortalCustomer,
  purpose: PortalMagicLinkPurpose,
  meta: { ip?: string | null } = {},
): Promise<{ delivered: boolean; previewMode: boolean }> {
  const { token, expiresAt } = await createMagicLink(customer.id, customer.tenant_id, purpose, meta.ip);
  const branding = await getPortalBranding(customer.tenant_id);
  const loginUrl = `${APP_URL}/portal/auth/${token}`;
  const expiresLabel = purpose === "invite" ? "3 days" : "20 minutes";

  const result = await safeSend({
    to: customer.email,
    subject: purpose === "invite" ? `Set up your ${branding.company_name} account` : `Sign in to ${branding.company_name}`,
    html: buildPortalMagicLinkHtml({
      companyName: branding.company_name,
      companyLogoUrl: branding.company_logo_url,
      customerName: customer.name,
      loginUrl,
      isInvite: purpose === "invite",
      expiresLabel,
    }),
    text: buildPortalMagicLinkText({
      companyName: branding.company_name,
      customerName: customer.name,
      loginUrl,
      isInvite: purpose === "invite",
      expiresLabel,
    }),
  });

  void expiresAt;
  return { delivered: result.delivered, previewMode: result.previewMode };
}
