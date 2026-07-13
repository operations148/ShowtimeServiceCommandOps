import { db } from "@/lib/db/client";
import type { Estimate } from "@/types/estimate";
import { resolveEstimateByTokenHash } from "@/lib/db/queries/estimates";
import { hashPublicToken, checkTokenValidity } from "@/lib/security/public-document-token";
import type { TenantBranding } from "@/lib/estimates/public-serializer";
import { logger } from "@/lib/security/logger";

/**
 * Resolves a public token to its estimate + tenant branding, applying token
 * validity checks. Any failure (bad token, revoked, expired) returns a single
 * `invalid` result so the caller can surface ONE generic error — no oracle for
 * which check failed. The coarse reason is logged server-side only.
 */
export type PublicResolveResult =
  | { ok: true; estimate: Estimate; branding: TenantBranding }
  | { ok: false };

export async function resolvePublicEstimate(
  rawToken: string,
  opts: { withLines?: boolean } = {}
): Promise<PublicResolveResult> {
  // Cheap shape guard before hashing/DB.
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return { ok: false };

  const hash = hashPublicToken(rawToken);
  const estimate = await resolveEstimateByTokenHash(hash, opts);
  if (!estimate) {
    logger.info("[public-estimate] token miss");
    return { ok: false };
  }

  const validity = checkTokenValidity({
    public_token_hash: hash,
    token_expires_at: estimate.token_expires_at,
    token_revoked_at: estimate.token_revoked_at,
  });
  if (!validity.valid) {
    logger.info("[public-estimate] token invalid", { reason: validity.reason });
    return { ok: false };
  }

  const { data: tenantRow } = await db
    .from("tenants")
    .select("name, logo_url, business_phone, business_email")
    .eq("id", estimate.tenant_id)
    .maybeSingle();
  const branding: TenantBranding = {
    company_name: (tenantRow as { name?: string } | null)?.name ?? "ServiceOps",
    company_logo_url: (tenantRow as { logo_url?: string | null } | null)?.logo_url ?? null,
    company_phone: (tenantRow as { business_phone?: string | null } | null)?.business_phone ?? null,
    company_email: (tenantRow as { business_email?: string | null } | null)?.business_email ?? null,
  };

  return { ok: true, estimate, branding };
}
