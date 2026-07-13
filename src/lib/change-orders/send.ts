import { db } from "@/lib/db/client";
import { ChangeOrderStatus } from "@/types/change-order";
import { getChangeOrderById, getChangeOrderLines, recordChangeOrderEvent } from "@/lib/db/queries/change-orders";
import { canTransition } from "@/lib/change-orders/state-machine";
import { generatePublicToken } from "@/lib/security/public-document-token";
import { safeSend } from "@/lib/email/safe-mailer";
import { buildChangeOrderEmailHtml, buildChangeOrderEmailText } from "@/lib/email/templates/change-order";

const PG_UNIQUE_VIOLATION = "23505";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "https://serviceops-ghl-workorders.vercel.app";

export type SendChangeOrderResult =
  | { ok: true; delivered: boolean; previewMode: boolean; testOverride: boolean; publicUrl: string }
  | { ok: false; reason: "not_found" | "stale_version" | "invalid_state" | "no_recipient" | "send_failed"; detail?: string };

interface TenantBrandingRow {
  name: string;
  logo_url: string | null;
  business_phone: string | null;
  business_email: string | null;
}

/**
 * Manual send (Phase 5, mirrors src/lib/estimates/send.ts). Freezes a
 * sent-version snapshot, (re)issues a hashed public token, and delivers via
 * the safe mailer (preview by default).
 */
export async function sendChangeOrder(
  changeOrderId: string,
  tenantId: string,
  input: { version: number; recipientEmail?: string; expiresInDays: number },
  actor: { userId: string; name?: string | null }
): Promise<SendChangeOrderResult> {
  const co = await getChangeOrderById(changeOrderId, tenantId);
  if (!co) return { ok: false, reason: "not_found" };
  if (co.version !== input.version) return { ok: false, reason: "stale_version" };

  const resend = co.status === ChangeOrderStatus.SENT || co.status === ChangeOrderStatus.VIEWED;
  if (!resend && !canTransition(co.status, ChangeOrderStatus.SENT)) {
    return { ok: false, reason: "invalid_state", detail: `cannot send from ${co.status}` };
  }

  const recipient = input.recipientEmail ?? co.customer_email ?? undefined;
  if (!recipient) return { ok: false, reason: "no_recipient" };

  const lines = await getChangeOrderLines(changeOrderId, tenantId);

  const { data: tenantRow } = await db
    .from("tenants")
    .select("name, logo_url, business_phone, business_email")
    .eq("id", tenantId)
    .maybeSingle();
  const branding = (tenantRow ?? { name: "ServiceOps", logo_url: null, business_phone: null, business_email: null }) as TenantBrandingRow;

  const { token, hash } = generatePublicToken();
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  await db.from("change_order_versions").insert({
    change_order_id: changeOrderId,
    tenant_id: tenantId,
    version: co.version,
    version_type: "sent",
    snapshot: { changeOrder: co, line_items: lines },
    created_by: actor.userId,
  }).then(({ error }) => {
    if (error && error.code !== PG_UNIQUE_VIOLATION) console.error("[change-orders] sent snapshot:", error.message);
  });

  const { error: updateError } = await db
    .from("change_orders")
    .update({
      status: ChangeOrderStatus.SENT,
      sent_at: co.sent_at ?? now.toISOString(),
      sent_version: co.version,
      public_token_hash: hash,
      token_expires_at: tokenExpiresAt,
      token_revoked_at: null,
    })
    .eq("id", changeOrderId)
    .eq("tenant_id", tenantId)
    .eq("version", input.version);
  if (updateError) return { ok: false, reason: "send_failed", detail: updateError.message };

  const publicUrl = `${APP_URL}/change-order/${token}`;

  const result = await safeSend({
    to: recipient,
    subject: `Change order ${co.change_order_number} from ${branding.name}`,
    html: buildChangeOrderEmailHtml({
      companyName: branding.name,
      companyLogoUrl: branding.logo_url,
      changeOrderNumber: co.change_order_number,
      reason: co.reason,
      customerName: co.customer_name,
      totalImpactCents: co.total_impact_cents,
      publicUrl,
      customerNotes: co.customer_notes,
    }),
    text: buildChangeOrderEmailText({
      companyName: branding.name,
      changeOrderNumber: co.change_order_number,
      reason: co.reason,
      customerName: co.customer_name,
      totalImpactCents: co.total_impact_cents,
      publicUrl,
    }),
  });

  const delivered = result.delivered;
  await recordChangeOrderEvent({
    changeOrderId,
    tenantId,
    eventType: delivered || result.previewMode ? "sent" : "send_failed",
    version: co.version,
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

export async function revokeChangeOrderToken(
  changeOrderId: string,
  tenantId: string,
  actor: { userId: string; name?: string | null }
): Promise<{ ok: boolean }> {
  const { data, error } = await db
    .from("change_orders")
    .update({ token_revoked_at: new Date().toISOString() })
    .eq("id", changeOrderId)
    .eq("tenant_id", tenantId)
    .not("public_token_hash", "is", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`[change-orders] revokeChangeOrderToken: ${error.message}`);
  if (!data) return { ok: false };

  await recordChangeOrderEvent({ changeOrderId, tenantId, eventType: "token_revoked", actorUserId: actor.userId, actorName: actor.name ?? null });
  return { ok: true };
}
