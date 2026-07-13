import { db } from "@/lib/db/client";
import { EstimateStatus, type Estimate, type EstimateLineItem } from "@/types/estimate";
import { getEstimateById, getEstimateLines, recordEstimateEvent } from "@/lib/db/queries/estimates";
import { computeEstimateTotals, validateSelections, applySelections } from "@/lib/estimates/totals";
import { isEstimateExpired } from "@/lib/estimates/public-serializer";
import { InvoiceStatus } from "@/types/invoice";
import { nextDocumentNumber } from "@/lib/db/queries/document-numbers";
import { depositAmount } from "@/lib/money/money";

const PG_UNIQUE_VIOLATION = "23505";

// The set of statuses in which a customer decision may still be claimed. Used
// as the atomic guard in the decision UPDATE so two concurrent submissions can
// never both win (exactly one row matches).
const DECIDABLE_DB_STATUSES = [EstimateStatus.SENT, EstimateStatus.VIEWED] as const;

export type DecisionContext = {
  ip?: string | null;
  userAgent?: string | null;
};

export type AcceptResult =
  | { ok: true; alreadyDecided: false; estimate: Estimate }
  | { ok: true; alreadyDecided: true; status: EstimateStatus } // idempotent replay
  | { ok: false; reason: "not_found" | "expired" | "stale_version" | "not_decidable" | "invalid_selection"; detail?: string };

export type DeclineResult =
  | { ok: true; alreadyDecided: false; estimate: Estimate }
  | { ok: true; alreadyDecided: true; status: EstimateStatus }
  | { ok: false; reason: "not_found" | "expired" | "stale_version" | "not_decidable" };

// ─── Accept ───────────────────────────────────────────────────────────────────
/**
 * Transactional, idempotent acceptance (Phase 3, ADR-0008). Given an estimate
 * already resolved by valid public token, this:
 *   1. verifies version, status, and expiration,
 *   2. validates + applies customer selections,
 *   3. recalculates totals server-side from the stored document,
 *   4. atomically claims the decision (conditional UPDATE on version+status) —
 *      the guard that makes concurrent/duplicate submissions safe,
 *   5. locks the accepted version, stores approval metadata,
 *   6. converts to a draft invoice (idempotent via UNIQUE(invoices.estimate_id)),
 *   7. records events.
 *
 * Replaying the same accepted token is a no-op that reports the existing
 * decision (alreadyDecided) rather than creating a second invoice.
 */
export async function acceptEstimate(
  estimateId: string,
  tenantId: string,
  input: {
    version: number;
    selectedLineIds: string[];
    acceptedByName: string;
    signature?: string;
    termsAcknowledged: true;
  },
  ctx: DecisionContext = {}
): Promise<AcceptResult> {
  const estimate = await getEstimateById(estimateId, tenantId);
  if (!estimate) return { ok: false, reason: "not_found" };

  // Idempotent replay: already accepted/converted (or declined/voided).
  if (
    estimate.status === EstimateStatus.ACCEPTED ||
    estimate.status === EstimateStatus.CONVERTED ||
    estimate.status === EstimateStatus.DECLINED ||
    estimate.status === EstimateStatus.VOIDED
  ) {
    // A prior accept is a success replay; decline/void is a conflicting decision.
    if (estimate.status === EstimateStatus.ACCEPTED || estimate.status === EstimateStatus.CONVERTED) {
      return { ok: true, alreadyDecided: true, status: estimate.status };
    }
    return { ok: false, reason: "not_decidable" };
  }
  if (estimate.status !== EstimateStatus.SENT && estimate.status !== EstimateStatus.VIEWED) {
    return { ok: false, reason: "not_decidable" };
  }
  if (estimate.version !== input.version) return { ok: false, reason: "stale_version" };
  if (isEstimateExpired(estimate)) return { ok: false, reason: "expired" };

  const lines = await getEstimateLines(estimateId, tenantId);
  const selection = validateSelections(lines, input.selectedLineIds);
  if (!selection.ok) return { ok: false, reason: "invalid_selection", detail: selection.reason };

  const finalLines = applySelections(lines, selection.selectedIds);
  const totals = computeEstimateTotals(finalLines, estimate.tax_rate, estimate.discount_amount);

  const now = new Date().toISOString();

  // ── Atomic decision claim ──────────────────────────────────────────────────
  // Only ONE concurrent submission can match (version + decidable status).
  const { data: claimed, error: claimError } = await db
    .from("estimates")
    .update({
      status: EstimateStatus.ACCEPTED,
      accepted_at: now,
      accepted_version: estimate.version,
      accepted_by_name: input.acceptedByName,
      accepted_signature: input.signature ?? null,
      accepted_ip: ctx.ip ?? null,
      accepted_user_agent: ctx.userAgent ?? null,
      terms_acknowledged: true,
      locked_at: now,
      subtotal: totals.subtotal,
      tax_amount: totals.tax_amount,
      total: totals.total,
    })
    .eq("id", estimateId)
    .eq("tenant_id", tenantId)
    .eq("version", input.version)
    .in("status", DECIDABLE_DB_STATUSES as unknown as string[])
    .select("*")
    .maybeSingle();
  if (claimError) throw new Error(`[estimates] acceptEstimate claim: ${claimError.message}`);
  if (!claimed) {
    // Lost the race or state changed under us — re-read and report idempotently.
    const fresh = await getEstimateById(estimateId, tenantId);
    if (fresh && (fresh.status === EstimateStatus.ACCEPTED || fresh.status === EstimateStatus.CONVERTED)) {
      return { ok: true, alreadyDecided: true, status: fresh.status };
    }
    return { ok: false, reason: "not_decidable" };
  }

  // Persist the customer's selection on the lines (best-effort; totals already stored).
  await persistSelections(estimateId, tenantId, finalLines);

  // Accepted-version snapshot (immutable).
  await db.from("estimate_versions").insert({
    estimate_id: estimateId,
    tenant_id: tenantId,
    version: estimate.version,
    version_type: "accepted",
    snapshot: { estimate: { ...estimate, status: EstimateStatus.ACCEPTED, ...totals }, line_items: finalLines },
  }).then(({ error }) => {
    if (error && error.code !== PG_UNIQUE_VIOLATION) console.error("[estimates] accepted snapshot:", error.message);
  });

  await recordEstimateEvent({
    estimateId,
    tenantId,
    eventType: "accepted",
    version: estimate.version,
    actorName: input.acceptedByName,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { total: totals.total, selected_line_ids: input.selectedLineIds },
  });

  // ── Convert to a draft invoice (idempotent) ────────────────────────────────
  await convertEstimateToInvoice(estimateId, tenantId, finalLines, totals);

  const updated = await getEstimateById(estimateId, tenantId, { withLines: true });
  return { ok: true, alreadyDecided: false, estimate: updated ?? mapClaim(claimed) };
}

function mapClaim(row: unknown): Estimate {
  // Fallback — never reached in practice since we re-read; keeps types honest.
  return row as Estimate;
}

async function persistSelections(estimateId: string, tenantId: string, lines: EstimateLineItem[]): Promise<void> {
  for (const line of lines) {
    if (line.kind === "standard") continue;
    const { error } = await db
      .from("estimate_line_items")
      .update({ is_selected: line.is_selected })
      .eq("id", line.id)
      .eq("estimate_id", estimateId)
      .eq("tenant_id", tenantId);
    if (error) console.error("[estimates] persistSelections:", error.message);
  }
}

// ─── Decline ──────────────────────────────────────────────────────────────────

export async function declineEstimate(
  estimateId: string,
  tenantId: string,
  input: { version: number; reason?: string },
  ctx: DecisionContext = {}
): Promise<DeclineResult> {
  const estimate = await getEstimateById(estimateId, tenantId);
  if (!estimate) return { ok: false, reason: "not_found" };

  if (estimate.status === EstimateStatus.DECLINED) {
    return { ok: true, alreadyDecided: true, status: estimate.status };
  }
  if (
    estimate.status === EstimateStatus.ACCEPTED ||
    estimate.status === EstimateStatus.CONVERTED ||
    estimate.status === EstimateStatus.VOIDED
  ) {
    return { ok: false, reason: "not_decidable" };
  }
  if (estimate.status !== EstimateStatus.SENT && estimate.status !== EstimateStatus.VIEWED) {
    return { ok: false, reason: "not_decidable" };
  }
  if (estimate.version !== input.version) return { ok: false, reason: "stale_version" };
  if (isEstimateExpired(estimate)) return { ok: false, reason: "expired" };

  const now = new Date().toISOString();
  const { data: claimed, error } = await db
    .from("estimates")
    .update({
      status: EstimateStatus.DECLINED,
      declined_at: now,
      decline_reason: input.reason ?? null,
    })
    .eq("id", estimateId)
    .eq("tenant_id", tenantId)
    .eq("version", input.version)
    .in("status", DECIDABLE_DB_STATUSES as unknown as string[])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[estimates] declineEstimate: ${error.message}`);
  if (!claimed) {
    const fresh = await getEstimateById(estimateId, tenantId);
    if (fresh && fresh.status === EstimateStatus.DECLINED) {
      return { ok: true, alreadyDecided: true, status: fresh.status };
    }
    return { ok: false, reason: "not_decidable" };
  }

  await recordEstimateEvent({
    estimateId,
    tenantId,
    eventType: "declined",
    version: estimate.version,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { reason: input.reason ?? null },
  });

  const updated = await getEstimateById(estimateId, tenantId, { withLines: true });
  return { ok: true, alreadyDecided: false, estimate: updated ?? mapClaim(claimed) };
}

// ─── Estimate → invoice conversion (idempotent) ───────────────────────────────
/**
 * Creates a DRAFT invoice from the accepted estimate and marks the estimate
 * converted. Idempotent via the partial UNIQUE(invoices.estimate_id): a second
 * call (or a concurrent one) hits 23505, re-links the existing invoice, and
 * does not duplicate. Phase 5 owns invoice sending/deposit collection — this
 * only materialises the draft so no work is lost at acceptance time.
 */
export async function convertEstimateToInvoice(
  estimateId: string,
  tenantId: string,
  lines: EstimateLineItem[],
  totals: { subtotal: number; tax_amount: number; total: number; discount_amount: number }
): Promise<{ ok: true; invoiceId: string } | { ok: false; reason: string }> {
  const estimate = await getEstimateById(estimateId, tenantId);
  if (!estimate) return { ok: false, reason: "estimate not found" };

  // Already converted — return the existing link.
  if (estimate.converted_invoice_id) {
    return { ok: true, invoiceId: estimate.converted_invoice_id };
  }

  const selected = lines.filter((l) => l.kind === "standard" || l.is_selected);
  const depositPercent = 10;
  const depositCents = depositAmount(totals.total, depositPercent);
  const invoiceNumber = await nextDocumentNumber(tenantId, "invoice");
  const now = new Date().toISOString();

  const { data: invoice, error } = await db
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      estimate_id: estimateId,
      estimate_handoff_id: estimate.estimate_handoff_id ?? null,
      work_order_id: estimate.work_order_id ?? null,
      property_id: estimate.property_id ?? null,
      ghl_opportunity_id: estimate.ghl_opportunity_id ?? null,
      invoice_number: invoiceNumber,
      title: estimate.title,
      status: InvoiceStatus.DRAFT,
      customer_name: estimate.customer_name,
      customer_email: estimate.customer_email ?? null,
      customer_phone: estimate.customer_phone ?? null,
      customer_address: estimate.customer_address ?? null,
      issue_date: now.slice(0, 10),
      subtotal: totals.subtotal,
      tax_rate: estimate.tax_rate,
      tax_amount: totals.tax_amount,
      discount_amount: totals.discount_amount,
      total: totals.total,
      amount_paid: 0,
      amount_due: totals.total,
      deposit_percent: depositPercent,
      deposit_amount: depositCents,
      deposit_required: true,
      terms: estimate.terms ?? null,
    })
    .select("id")
    .single();

  let invoiceId: string;
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      // Concurrent conversion won — adopt the existing invoice.
      const { data: existing } = await db
        .from("invoices")
        .select("id")
        .eq("estimate_id", estimateId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!existing) return { ok: false, reason: "conversion race with no invoice" };
      invoiceId = (existing as { id: string }).id;
    } else {
      return { ok: false, reason: error.message };
    }
  } else {
    invoiceId = (invoice as { id: string }).id;

    // Snapshot the selected estimate lines onto the invoice.
    if (selected.length > 0) {
      const rows = selected.map((l, i) => ({
        invoice_id: invoiceId,
        tenant_id: tenantId,
        sort_order: i,
        description: l.name,
        details: l.description ?? null,
        quantity: l.quantity,
        unit_price: l.unit_price,
        unit_cost: l.unit_cost ?? 0,
        taxable: l.taxable,
        discount_amount: l.discount_amount,
        total: l.total,
        source_pricebook_item_id: l.source_pricebook_item_id ?? null,
        source_pricebook_version: l.source_pricebook_version ?? null,
      }));
      const { error: liErr } = await db.from("invoice_line_items").insert(rows);
      if (liErr) console.error("[estimates] invoice line insert:", liErr.message);
    }
  }

  // Link + mark converted (guard: only from accepted, don't clobber a later void).
  const { error: linkError } = await db
    .from("estimates")
    .update({
      status: EstimateStatus.CONVERTED,
      converted_invoice_id: invoiceId,
      converted_at: now,
    })
    .eq("id", estimateId)
    .eq("tenant_id", tenantId)
    .eq("status", EstimateStatus.ACCEPTED);
  if (linkError) console.error("[estimates] convert link:", linkError.message);

  await recordEstimateEvent({
    estimateId,
    tenantId,
    eventType: "converted",
    metadata: { invoice_id: invoiceId, invoice_number: invoiceNumber },
  });

  return { ok: true, invoiceId };
}
