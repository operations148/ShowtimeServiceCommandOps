import { db } from "@/lib/db/client";
import type { Invoice } from "@/types/invoice";
import type { TenantRow } from "@/lib/db/types";
import { resolveInvoiceByTokenHash } from "@/lib/db/queries/invoices";
import { hashPublicToken, checkTokenValidity } from "@/lib/security/public-document-token";
import { canAcceptPayments } from "@/lib/stripe/connect";
import type { TenantBranding } from "@/lib/estimates/public-serializer";
import { logger } from "@/lib/security/logger";

/**
 * Resolves a public invoice token to its invoice + tenant branding + a
 * can-pay-online flag, mirroring src/lib/change-orders/public-resolve.ts. Any
 * failure (bad token, revoked, expired) returns a single `invalid` result —
 * no oracle for which check failed. The tenant is always derived from the
 * resolved row, never the caller.
 */
export type PublicInvoiceResolveResult =
  | { ok: true; invoice: Invoice; branding: TenantBranding; canPayOnline: boolean }
  | { ok: false };

export async function resolvePublicInvoice(
  rawToken: string,
  opts: { withLines?: boolean } = {}
): Promise<PublicInvoiceResolveResult> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return { ok: false };

  const hash = hashPublicToken(rawToken);
  const invoice = await resolveInvoiceByTokenHash(hash, opts);
  if (!invoice) {
    logger.info("[public-invoice] token miss");
    return { ok: false };
  }

  const validity = checkTokenValidity({
    public_token_hash: hash,
    token_expires_at: invoice.token_expires_at,
    token_revoked_at: invoice.token_revoked_at,
  });
  if (!validity.valid) {
    logger.info("[public-invoice] token invalid", { reason: validity.reason });
    return { ok: false };
  }

  const { data: tenantRow } = await db
    .from("tenants")
    .select("*")
    .eq("id", invoice.tenant_id)
    .maybeSingle();

  const branding: TenantBranding = {
    company_name: (tenantRow as { name?: string } | null)?.name ?? "ServiceOps",
    company_logo_url: (tenantRow as { logo_url?: string | null } | null)?.logo_url ?? null,
    company_phone: (tenantRow as { business_phone?: string | null } | null)?.business_phone ?? null,
    company_email: (tenantRow as { business_email?: string | null } | null)?.business_email ?? null,
  };
  const canPayOnline = tenantRow ? canAcceptPayments(tenantRow as unknown as TenantRow) : false;

  return { ok: true, invoice, branding, canPayOnline };
}
