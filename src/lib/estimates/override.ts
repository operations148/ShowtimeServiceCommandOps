import { db } from "@/lib/db/client";
import { EstimateStatus } from "@/types/estimate";
import { getEstimateById, getEstimateLines, recordEstimateEvent } from "@/lib/db/queries/estimates";

/**
 * Admin override (Phase 3, ADR-0008). Re-opens a locked estimate
 * (accepted/expired/declined) back into an editable draft. Requires the
 * canOverrideEstimateLock permission (enforced at the route) AND a mandatory
 * reason (enforced here + by Zod). Writes an audited override event with the
 * reason and a version snapshot of the pre-override state.
 *
 * Guardrails:
 *   - A CONVERTED estimate cannot be overridden (an invoice already exists —
 *     unwinding that is a Phase 5 concern, not an estimate edit).
 *   - The override bumps the version and clears the accepted/lock metadata so
 *     the re-opened draft is a clean editing surface; the prior accepted-version
 *     snapshot remains immutable in estimate_versions.
 */

export type OverrideResult =
  | { ok: true; newVersion: number }
  | { ok: false; reason: "not_found" | "not_overridable"; status?: EstimateStatus };

export async function overrideEstimateLock(
  estimateId: string,
  tenantId: string,
  reason: string,
  actor: { userId: string; name?: string | null }
): Promise<OverrideResult> {
  const estimate = await getEstimateById(estimateId, tenantId);
  if (!estimate) return { ok: false, reason: "not_found" };

  const overridable =
    estimate.status === EstimateStatus.ACCEPTED ||
    estimate.status === EstimateStatus.EXPIRED ||
    estimate.status === EstimateStatus.DECLINED;
  if (!overridable) {
    return { ok: false, reason: "not_overridable", status: estimate.status };
  }

  // Snapshot the pre-override state for the audit trail (immutable history).
  const lines = await getEstimateLines(estimateId, tenantId);
  await db.from("estimate_versions").insert({
    estimate_id: estimateId,
    tenant_id: tenantId,
    version: estimate.version,
    version_type: estimate.status === EstimateStatus.ACCEPTED ? "accepted" : "draft",
    snapshot: { estimate, line_items: lines },
    reason: `pre-override: ${reason}`,
    created_by: actor.userId,
  }).then(({ error }) => {
    if (error) console.error("[estimates] override snapshot:", error.message);
  });

  const newVersion = estimate.version + 1;
  const { data, error } = await db
    .from("estimates")
    .update({
      status: EstimateStatus.DRAFT,
      version: newVersion,
      accepted_at: null,
      accepted_by_name: null,
      accepted_signature: null,
      accepted_ip: null,
      accepted_user_agent: null,
      accepted_version: null,
      declined_at: null,
      decline_reason: null,
      locked_at: null,
      locked_by: null,
      // Revoke the outstanding public link — the re-opened draft must be re-sent.
      token_revoked_at: new Date().toISOString(),
    })
    .eq("id", estimateId)
    .eq("tenant_id", tenantId)
    .eq("version", estimate.version)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`[estimates] overrideEstimateLock: ${error.message}`);
  if (!data) return { ok: false, reason: "not_overridable", status: estimate.status };

  await recordEstimateEvent({
    estimateId,
    tenantId,
    eventType: "override",
    version: newVersion,
    actorUserId: actor.userId,
    actorName: actor.name ?? null,
    metadata: { reason, previous_status: estimate.status },
  });

  return { ok: true, newVersion };
}
