import { db } from "@/lib/db/client";
import type { ChangeOrder } from "@/types/change-order";
import { resolveChangeOrderByTokenHash } from "@/lib/db/queries/change-orders";
import { hashPublicToken, checkTokenValidity } from "@/lib/security/public-document-token";
import type { TenantBranding } from "@/lib/estimates/public-serializer";
import { logger } from "@/lib/security/logger";

/**
 * Resolves a public change-order token to its change order + tenant
 * branding, mirroring src/lib/estimates/public-resolve.ts exactly. Any
 * failure (bad token, revoked, expired) returns a single `invalid` result —
 * no oracle for which check failed.
 */
export type PublicResolveResult =
  | { ok: true; changeOrder: ChangeOrder; branding: TenantBranding }
  | { ok: false };

export async function resolvePublicChangeOrder(
  rawToken: string,
  opts: { withLines?: boolean } = {}
): Promise<PublicResolveResult> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return { ok: false };

  const hash = hashPublicToken(rawToken);
  const co = await resolveChangeOrderByTokenHash(hash, opts);
  if (!co) {
    logger.info("[public-change-order] token miss");
    return { ok: false };
  }

  const validity = checkTokenValidity({
    public_token_hash: hash,
    token_expires_at: co.token_expires_at,
    token_revoked_at: co.token_revoked_at,
  });
  if (!validity.valid) {
    logger.info("[public-change-order] token invalid", { reason: validity.reason });
    return { ok: false };
  }

  const { data: tenantRow } = await db
    .from("tenants")
    .select("name, logo_url, business_phone, business_email")
    .eq("id", co.tenant_id)
    .maybeSingle();
  const branding: TenantBranding = {
    company_name: (tenantRow as { name?: string } | null)?.name ?? "ServiceOps",
    company_logo_url: (tenantRow as { logo_url?: string | null } | null)?.logo_url ?? null,
    company_phone: (tenantRow as { business_phone?: string | null } | null)?.business_phone ?? null,
    company_email: (tenantRow as { business_email?: string | null } | null)?.business_email ?? null,
  };

  return { ok: true, changeOrder: co, branding };
}
