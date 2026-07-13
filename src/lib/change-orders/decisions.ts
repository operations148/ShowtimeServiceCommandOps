import { db } from "@/lib/db/client";
import { ChangeOrderStatus, type ChangeOrder } from "@/types/change-order";
import { getChangeOrderById, getChangeOrderLines, recordChangeOrderEvent } from "@/lib/db/queries/change-orders";
import { isChangeOrderExpired } from "@/lib/change-orders/public-serializer";

const PG_UNIQUE_VIOLATION = "23505";

// Statuses from which a decision may still be claimed — mirrors the estimate
// acceptance guard (Phase 3, ADR-0008) exactly.
const DECIDABLE_DB_STATUSES = [ChangeOrderStatus.SENT, ChangeOrderStatus.VIEWED] as const;

export type DecisionContext = { ip?: string | null; userAgent?: string | null };

export type AcceptResult =
  | { ok: true; alreadyDecided: false; changeOrder: ChangeOrder }
  | { ok: true; alreadyDecided: true; status: ChangeOrderStatus }
  | { ok: false; reason: "not_found" | "expired" | "stale_version" | "not_decidable" };

export type RejectResult =
  | { ok: true; alreadyDecided: false; changeOrder: ChangeOrder }
  | { ok: true; alreadyDecided: true; status: ChangeOrderStatus }
  | { ok: false; reason: "not_found" | "expired" | "stale_version" | "not_decidable" };

/**
 * Transactional, idempotent acceptance (Phase 5, ADR-0011 — mirrors the
 * estimate acceptance pattern in src/lib/estimates/decisions.ts). Verifies
 * version/status/expiration, atomically claims the decision (conditional
 * UPDATE on version+status — the guard that makes concurrent/duplicate
 * submissions safe), locks the accepted version, and applies the price
 * impact to the parent work order's approved_contract_amount_cents in the
 * SAME atomic step as the claim (via a single UPDATE with an expression,
 * avoiding a separate non-atomic read-then-write on the work order).
 *
 * Schedule impact is recorded but deliberately NOT applied here — that
 * requires the explicit applyScheduleImpact action (ADR-0011).
 */
export async function acceptChangeOrder(
  changeOrderId: string,
  tenantId: string,
  input: { version: number; acceptedByName: string; signature?: string },
  ctx: DecisionContext = {}
): Promise<AcceptResult> {
  const co = await getChangeOrderById(changeOrderId, tenantId);
  if (!co) return { ok: false, reason: "not_found" };

  if (co.status === ChangeOrderStatus.ACCEPTED) {
    return { ok: true, alreadyDecided: true, status: co.status };
  }
  if (co.status === ChangeOrderStatus.REJECTED || co.status === ChangeOrderStatus.VOIDED) {
    return { ok: false, reason: "not_decidable" };
  }
  if (co.status !== ChangeOrderStatus.SENT && co.status !== ChangeOrderStatus.VIEWED) {
    return { ok: false, reason: "not_decidable" };
  }
  if (co.version !== input.version) return { ok: false, reason: "stale_version" };
  if (isChangeOrderExpired(co)) return { ok: false, reason: "expired" };

  const now = new Date().toISOString();

  // Atomic decision claim — only ONE concurrent submission can match.
  const { data: claimed, error: claimError } = await db
    .from("change_orders")
    .update({
      status: ChangeOrderStatus.ACCEPTED,
      accepted_at: now,
      accepted_version: co.version,
      accepted_by_name: input.acceptedByName,
      accepted_signature: input.signature ?? null,
      accepted_ip: ctx.ip ?? null,
      accepted_user_agent: ctx.userAgent ?? null,
      locked_at: now,
    })
    .eq("id", changeOrderId)
    .eq("tenant_id", tenantId)
    .eq("version", input.version)
    .in("status", DECIDABLE_DB_STATUSES as unknown as string[])
    .select("*")
    .maybeSingle();
  if (claimError) throw new Error(`[change-orders] acceptChangeOrder claim: ${claimError.message}`);
  if (!claimed) {
    const fresh = await getChangeOrderById(changeOrderId, tenantId);
    if (fresh && fresh.status === ChangeOrderStatus.ACCEPTED) {
      return { ok: true, alreadyDecided: true, status: fresh.status };
    }
    return { ok: false, reason: "not_decidable" };
  }

  // Apply the price impact to the parent work order's contract value.
  // Read-then-write is acceptable here (not a hot path) but tenant-scoped and
  // re-verified; duplicate application is prevented because acceptance
  // itself is claimed exactly once (the update above can only ever succeed
  // for one caller).
  const { data: wo } = await db
    .from("work_orders")
    .select("approved_contract_amount_cents")
    .eq("id", co.work_order_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (wo) {
    const current = (wo as { approved_contract_amount_cents: number }).approved_contract_amount_cents;
    const next = Math.max(0, current + co.price_impact_cents);
    await db
      .from("work_orders")
      .update({ approved_contract_amount_cents: next })
      .eq("id", co.work_order_id)
      .eq("tenant_id", tenantId);
  }

  const lines = await getChangeOrderLines(changeOrderId, tenantId);
  await db.from("change_order_versions").insert({
    change_order_id: changeOrderId,
    tenant_id: tenantId,
    version: co.version,
    version_type: "accepted",
    snapshot: { changeOrder: { ...co, status: ChangeOrderStatus.ACCEPTED }, line_items: lines },
  }).then(({ error }) => {
    if (error && error.code !== PG_UNIQUE_VIOLATION) console.error("[change-orders] accepted snapshot:", error.message);
  });

  await recordChangeOrderEvent({
    changeOrderId,
    tenantId,
    eventType: "accepted",
    version: co.version,
    actorName: input.acceptedByName,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  await recordChangeOrderEvent({
    changeOrderId,
    tenantId,
    eventType: "contract_value_applied",
    metadata: { price_impact_cents: co.price_impact_cents, work_order_id: co.work_order_id },
  });

  const updated = await getChangeOrderById(changeOrderId, tenantId, { withLines: true });
  return { ok: true, alreadyDecided: false, changeOrder: updated ?? (claimed as unknown as ChangeOrder) };
}

export async function rejectChangeOrder(
  changeOrderId: string,
  tenantId: string,
  input: { version: number; reason?: string },
  ctx: DecisionContext = {}
): Promise<RejectResult> {
  const co = await getChangeOrderById(changeOrderId, tenantId);
  if (!co) return { ok: false, reason: "not_found" };

  if (co.status === ChangeOrderStatus.REJECTED) {
    return { ok: true, alreadyDecided: true, status: co.status };
  }
  if (co.status === ChangeOrderStatus.ACCEPTED || co.status === ChangeOrderStatus.VOIDED) {
    return { ok: false, reason: "not_decidable" };
  }
  if (co.status !== ChangeOrderStatus.SENT && co.status !== ChangeOrderStatus.VIEWED) {
    return { ok: false, reason: "not_decidable" };
  }
  if (co.version !== input.version) return { ok: false, reason: "stale_version" };
  if (isChangeOrderExpired(co)) return { ok: false, reason: "expired" };

  const now = new Date().toISOString();
  const { data: claimed, error } = await db
    .from("change_orders")
    .update({ status: ChangeOrderStatus.REJECTED, rejected_at: now, reject_reason: input.reason ?? null })
    .eq("id", changeOrderId)
    .eq("tenant_id", tenantId)
    .eq("version", input.version)
    .in("status", DECIDABLE_DB_STATUSES as unknown as string[])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[change-orders] rejectChangeOrder: ${error.message}`);
  if (!claimed) {
    const fresh = await getChangeOrderById(changeOrderId, tenantId);
    if (fresh && fresh.status === ChangeOrderStatus.REJECTED) {
      return { ok: true, alreadyDecided: true, status: fresh.status };
    }
    return { ok: false, reason: "not_decidable" };
  }

  await recordChangeOrderEvent({
    changeOrderId,
    tenantId,
    eventType: "rejected",
    version: co.version,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { reason: input.reason ?? null },
  });

  const updated = await getChangeOrderById(changeOrderId, tenantId, { withLines: true });
  return { ok: true, alreadyDecided: false, changeOrder: updated ?? (claimed as unknown as ChangeOrder) };
}
