import { db } from "@/lib/db/client";
import { EstimateStatus } from "@/types/estimate";
import { getEstimateById, getEstimateLines, recordEstimateEvent } from "@/lib/db/queries/estimates";
import { canTransition } from "@/lib/estimates/state-machine";
import { generatePublicToken } from "@/lib/security/public-document-token";
import { safeSend } from "@/lib/email/safe-mailer";
import { buildProposalEmailHtml, buildProposalEmailText } from "@/lib/email/templates/estimate-proposal";

const PG_UNIQUE_VIOLATION = "23505";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "https://serviceops-ghl-workorders.vercel.app";

export type SendEstimateResult =
  | { ok: true; delivered: boolean; previewMode: boolean; testOverride: boolean; publicUrl: string }
  | { ok: false; reason: "not_found" | "stale_version" | "invalid_state" | "no_recipient" | "send_failed"; detail?: string };

interface TenantBrandingRow {
  name: string;
  logo_url: string | null;
  business_phone: string | null;
  business_email: string | null;
}

/**
 * Manual send (Phase 3). Freezes a sent-version snapshot, (re)issues a hashed
 * public token, and delivers via the safe mailer (preview by default). Every
 * attempt — delivered, preview, or failed — is written to the estimate_events
 * send log so the admin can see status and manually retry.
 */
export async function sendEstimate(
  estimateId: string,
  tenantId: string,
  input: { version: number; recipientEmail?: string; expiresInDays: number },
  actor: { userId: string; name?: string | null }
): Promise<SendEstimateResult> {
  const estimate = await getEstimateById(estimateId, tenantId);
  if (!estimate) return { ok: false, reason: "not_found" };
  if (estimate.version !== input.version) return { ok: false, reason: "stale_version" };

  // Allowed from draft/ready (first send) or resend while already sent/viewed.
  const resend = estimate.status === EstimateStatus.SENT || estimate.status === EstimateStatus.VIEWED;
  if (!resend && !canTransition(estimate.status, EstimateStatus.SENT)) {
    return { ok: false, reason: "invalid_state", detail: `cannot send from ${estimate.status}` };
  }

  const recipient = input.recipientEmail ?? estimate.customer_email ?? undefined;
  if (!recipient) return { ok: false, reason: "no_recipient" };

  const lines = await getEstimateLines(estimateId, tenantId);

  // Fetch tenant branding (public-safe subset).
  const { data: tenantRow } = await db
    .from("tenants")
    .select("name, logo_url, business_phone, business_email")
    .eq("id", tenantId)
    .maybeSingle();
  const branding = (tenantRow ?? { name: "ServiceOps", logo_url: null, business_phone: null, business_email: null }) as TenantBrandingRow;

  // Issue a fresh token (revokes any prior link by replacing the hash).
  const { token, hash } = generatePublicToken();
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  // Freeze the sent-version snapshot (immutable; ignore duplicate-version races).
  await db.from("estimate_versions").insert({
    estimate_id: estimateId,
    tenant_id: tenantId,
    version: estimate.version,
    version_type: "sent",
    snapshot: { estimate, line_items: lines },
    created_by: actor.userId,
  }).then(({ error }) => {
    if (error && error.code !== PG_UNIQUE_VIOLATION) console.error("[estimates] sent snapshot:", error.message);
  });

  // Transition to sent + set token metadata + sent_version.
  const { error: updateError } = await db
    .from("estimates")
    .update({
      status: EstimateStatus.SENT,
      sent_at: estimate.sent_at ?? now.toISOString(),
      sent_version: estimate.version,
      public_token_hash: hash,
      token_expires_at: tokenExpiresAt,
      token_revoked_at: null,
    })
    .eq("id", estimateId)
    .eq("tenant_id", tenantId)
    .eq("version", input.version);
  if (updateError) return { ok: false, reason: "send_failed", detail: updateError.message };

  const publicUrl = `${APP_URL}/estimate/${token}`;

  // Deliver via the safe mailer (preview by default).
  const result = await safeSend({
    to: recipient,
    subject: `Your estimate ${estimate.estimate_number} from ${branding.name}`,
    html: buildProposalEmailHtml({
      companyName: branding.name,
      companyLogoUrl: branding.logo_url,
      estimateNumber: estimate.estimate_number,
      title: estimate.title,
      customerName: estimate.customer_name,
      totalCents: estimate.total,
      expiresAt: estimate.expires_at,
      publicUrl,
      customerNotes: estimate.customer_notes,
    }),
    text: buildProposalEmailText({
      companyName: branding.name,
      estimateNumber: estimate.estimate_number,
      title: estimate.title,
      customerName: estimate.customer_name,
      totalCents: estimate.total,
      expiresAt: estimate.expires_at,
      publicUrl,
    }),
  });

  const delivered = result.delivered;
  await recordEstimateEvent({
    estimateId,
    tenantId,
    eventType: delivered || result.previewMode ? "sent" : "send_failed",
    version: estimate.version,
    actorUserId: actor.userId,
    actorName: actor.name ?? null,
    recipientEmail: recipient,
    previewMode: result.previewMode,
    testOverride: "testOverride" in result ? result.testOverride : false,
    providerMessageId: "providerMessageId" in result ? result.providerMessageId : null,
    errorDetail: "error" in result ? result.error : null,
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

/** Revokes the public link without changing the estimate's decision state. */
export async function revokeEstimateToken(
  estimateId: string,
  tenantId: string,
  actor: { userId: string; name?: string | null }
): Promise<{ ok: boolean }> {
  const { data, error } = await db
    .from("estimates")
    .update({ token_revoked_at: new Date().toISOString() })
    .eq("id", estimateId)
    .eq("tenant_id", tenantId)
    .not("public_token_hash", "is", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`[estimates] revokeEstimateToken: ${error.message}`);
  if (!data) return { ok: false };

  await recordEstimateEvent({
    estimateId,
    tenantId,
    eventType: "token_revoked",
    actorUserId: actor.userId,
    actorName: actor.name ?? null,
  });
  return { ok: true };
}
