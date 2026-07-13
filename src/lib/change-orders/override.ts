import { db } from "@/lib/db/client";
import { ChangeOrderStatus } from "@/types/change-order";
import { getChangeOrderById, getChangeOrderLines, recordChangeOrderEvent } from "@/lib/db/queries/change-orders";

/**
 * Admin override (Phase 5, mirrors src/lib/estimates/override.ts). Re-opens a
 * locked change order (accepted/rejected/expired) back into an editable
 * draft. Requires canOverrideChangeOrderLock (enforced at the route) AND a
 * mandatory reason. An accepted change order's contract-value application is
 * NOT reversed automatically — the reason field must document any manual
 * correction needed, and a corrective change order is the recommended path
 * (ADR-0011).
 */

export type OverrideResult =
  | { ok: true; newVersion: number }
  | { ok: false; reason: "not_found" | "not_overridable"; status?: ChangeOrderStatus };

export async function overrideChangeOrderLock(
  changeOrderId: string,
  tenantId: string,
  reason: string,
  actor: { userId: string; name?: string | null }
): Promise<OverrideResult> {
  const co = await getChangeOrderById(changeOrderId, tenantId);
  if (!co) return { ok: false, reason: "not_found" };

  const overridable =
    co.status === ChangeOrderStatus.ACCEPTED ||
    co.status === ChangeOrderStatus.REJECTED ||
    co.status === ChangeOrderStatus.EXPIRED;
  if (!overridable) return { ok: false, reason: "not_overridable", status: co.status };

  const lines = await getChangeOrderLines(changeOrderId, tenantId);
  await db.from("change_order_versions").insert({
    change_order_id: changeOrderId,
    tenant_id: tenantId,
    version: co.version,
    version_type: co.status === ChangeOrderStatus.ACCEPTED ? "accepted" : "draft",
    snapshot: { changeOrder: co, line_items: lines },
    reason: `pre-override: ${reason}`,
    created_by: actor.userId,
  }).then(({ error }) => {
    if (error) console.error("[change-orders] override snapshot:", error.message);
  });

  const newVersion = co.version + 1;
  const { data, error } = await db
    .from("change_orders")
    .update({
      status: ChangeOrderStatus.DRAFT,
      version: newVersion,
      accepted_at: null,
      accepted_by_name: null,
      accepted_signature: null,
      accepted_ip: null,
      accepted_user_agent: null,
      accepted_version: null,
      rejected_at: null,
      reject_reason: null,
      locked_at: null,
      locked_by: null,
      token_revoked_at: new Date().toISOString(),
    })
    .eq("id", changeOrderId)
    .eq("tenant_id", tenantId)
    .eq("version", co.version)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`[change-orders] overrideChangeOrderLock: ${error.message}`);
  if (!data) return { ok: false, reason: "not_overridable", status: co.status };

  await recordChangeOrderEvent({
    changeOrderId,
    tenantId,
    eventType: "override",
    version: newVersion,
    actorUserId: actor.userId,
    actorName: actor.name ?? null,
    metadata: { reason, previous_status: co.status },
  });

  return { ok: true, newVersion };
}
