import { db } from "@/lib/db/client";
import {
  EstimateStatus,
  type Estimate,
  type EstimateLineItem,
  type EstimateVersion,
  type EstimateEvent,
  type EstimateEventType,
  type EstimateVersionType,
} from "@/types/estimate";
import type {
  CreateEstimateInput,
  PatchEstimateInput,
  EstimateLineInput,
  ListEstimatesQuery,
} from "@/lib/validation/estimate";
import { nextDocumentNumber } from "./document-numbers";
import { computeEstimateTotals } from "@/lib/estimates/totals";
import { canTransition, isEditable } from "@/lib/estimates/state-machine";
import { lineTotal } from "@/lib/money/money";

// ─── Row types ────────────────────────────────────────────────────────────────

type EstimateRow = {
  id: string;
  tenant_id: string;
  estimate_handoff_id: string | null;
  work_order_id: string | null;
  property_id: string | null;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  estimate_number: string;
  title: string;
  status: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  issue_date: string;
  expires_at: string | null;
  assigned_estimator_id: string | null;
  proposal_template: string;
  subtotal: number;
  tax_rate: number | string;
  tax_amount: number;
  discount_amount: number;
  total: number;
  internal_notes: string | null;
  customer_notes: string | null;
  terms: string | null;
  version: number;
  sent_version: number | null;
  accepted_version: number | null;
  public_token_hash: string | null;
  token_expires_at: string | null;
  token_revoked_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  converted_at: string | null;
  voided_at: string | null;
  decline_reason: string | null;
  accepted_by_name: string | null;
  accepted_signature: string | null;
  accepted_ip: string | null;
  accepted_user_agent: string | null;
  terms_acknowledged: boolean;
  locked_at: string | null;
  locked_by: string | null;
  converted_invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type LineRow = {
  id: string;
  estimate_id: string;
  tenant_id: string;
  sort_order: number;
  kind: string;
  option_group: string | null;
  is_selected: boolean;
  name: string;
  description: string | null;
  unit: string | null;
  quantity: number | string;
  unit_price: number;
  unit_cost: number;
  taxable: boolean;
  tax_category: string | null;
  discount_amount: number;
  markup_percent: number | string | null;
  total: number;
  source_pricebook_item_id: string | null;
  source_pricebook_version: number | null;
  created_at: string;
};

function mapLine(row: LineRow): EstimateLineItem {
  return {
    id: row.id,
    estimate_id: row.estimate_id,
    tenant_id: row.tenant_id,
    sort_order: row.sort_order,
    kind: row.kind as EstimateLineItem["kind"],
    option_group: row.option_group,
    is_selected: row.is_selected,
    name: row.name,
    description: row.description,
    unit: row.unit,
    quantity: Number(row.quantity),
    unit_price: row.unit_price,
    unit_cost: row.unit_cost,
    taxable: row.taxable,
    tax_category: row.tax_category,
    discount_amount: row.discount_amount,
    markup_percent: row.markup_percent === null ? null : Number(row.markup_percent),
    total: row.total,
    source_pricebook_item_id: row.source_pricebook_item_id,
    source_pricebook_version: row.source_pricebook_version,
    created_at: row.created_at,
  };
}

function mapEstimate(row: EstimateRow, lines?: EstimateLineItem[]): Estimate {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    estimate_handoff_id: row.estimate_handoff_id,
    work_order_id: row.work_order_id,
    property_id: row.property_id,
    ghl_contact_id: row.ghl_contact_id,
    ghl_opportunity_id: row.ghl_opportunity_id,
    estimate_number: row.estimate_number,
    title: row.title,
    status: row.status as EstimateStatus,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    customer_phone: row.customer_phone,
    customer_address: row.customer_address,
    issue_date: row.issue_date,
    expires_at: row.expires_at,
    assigned_estimator_id: row.assigned_estimator_id,
    proposal_template: row.proposal_template,
    subtotal: row.subtotal,
    tax_rate: Number(row.tax_rate),
    tax_amount: row.tax_amount,
    discount_amount: row.discount_amount,
    total: row.total,
    internal_notes: row.internal_notes,
    customer_notes: row.customer_notes,
    terms: row.terms,
    version: row.version,
    sent_version: row.sent_version,
    accepted_version: row.accepted_version,
    token_expires_at: row.token_expires_at,
    token_revoked_at: row.token_revoked_at,
    has_active_token: row.public_token_hash !== null && row.token_revoked_at === null,
    sent_at: row.sent_at,
    viewed_at: row.viewed_at,
    accepted_at: row.accepted_at,
    declined_at: row.declined_at,
    converted_at: row.converted_at,
    voided_at: row.voided_at,
    decline_reason: row.decline_reason,
    accepted_by_name: row.accepted_by_name,
    accepted_signature: row.accepted_signature,
    terms_acknowledged: row.terms_acknowledged,
    locked_at: row.locked_at,
    locked_by: row.locked_by,
    converted_invoice_id: row.converted_invoice_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    line_items: lines,
  };
}

// ─── Result unions ────────────────────────────────────────────────────────────

export type EstimateWriteResult =
  | { ok: true; data: Estimate }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true; currentVersion: number }
  | { ok: false; notEditable: true; status: EstimateStatus }
  | { ok: false; invalidTransition: true; from: EstimateStatus; to: EstimateStatus };

const PG_UNIQUE_VIOLATION = "23505";

// ─── Pricebook-aware line snapshotting ────────────────────────────────────────
// For lines referencing a pricebook item, the authoritative price/cost/name are
// snapshotted from the item server-side (client price is ignored). Custom lines
// use the validated client input. Every `total` is recomputed server-side.

type PreparedLine = {
  sort_order: number;
  kind: string;
  option_group: string | null;
  is_selected: boolean;
  name: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  taxable: boolean;
  tax_category: string | null;
  discount_amount: number;
  markup_percent: number | null;
  total: number;
  source_pricebook_item_id: string | null;
  source_pricebook_version: number | null;
};

async function prepareLines(
  inputs: EstimateLineInput[],
  tenantId: string
): Promise<{ ok: true; lines: PreparedLine[] } | { ok: false; badItemId: string }> {
  const pbIds = [...new Set(inputs.map((l) => l.source_pricebook_item_id).filter(Boolean))] as string[];
  const pbById = new Map<string, { name: string; description: string | null; unit: string | null; customer_price: number; internal_cost: number; taxable: boolean; tax_category: string | null; version: number }>();

  if (pbIds.length > 0) {
    const { data, error } = await db
      .from("pricebook_items")
      .select("id, name, description, unit, customer_price, internal_cost, taxable, tax_category, version")
      .eq("tenant_id", tenantId)
      .in("id", pbIds);
    if (error) throw new Error(`[db] prepareLines pricebook fetch: ${error.message}`);
    for (const row of (data ?? []) as Array<{ id: string } & NonNullable<ReturnType<typeof pbById.get>>>) {
      pbById.set(row.id, row);
    }
  }

  const lines: PreparedLine[] = [];
  inputs.forEach((input, index) => {
    let name = input.name;
    let description = input.description ?? null;
    let unit = input.unit ?? null;
    let unitPrice = input.unit_price;
    let unitCost = input.unit_cost ?? 0;
    let taxable = input.taxable;
    let taxCategory = input.tax_category ?? null;
    let sourceVersion: number | null = null;

    if (input.source_pricebook_item_id) {
      const pb = pbById.get(input.source_pricebook_item_id);
      if (!pb) {
        // signal handled below
        throw new PrepareLineError(input.source_pricebook_item_id);
      }
      // Server-authoritative snapshot from the pricebook item.
      name = pb.name;
      description = pb.description;
      unit = pb.unit;
      unitPrice = pb.customer_price;
      unitCost = pb.internal_cost;
      taxable = pb.taxable;
      taxCategory = pb.tax_category;
      sourceVersion = pb.version;
    }

    const total = lineTotal({
      quantity: input.quantity,
      unit_price: unitPrice,
      discount_amount: input.discount_amount,
    });

    lines.push({
      sort_order: index,
      kind: input.kind,
      option_group: input.option_group ?? null,
      is_selected: input.kind === "standard" ? true : input.is_selected,
      name,
      description,
      unit,
      quantity: input.quantity,
      unit_price: unitPrice,
      unit_cost: unitCost,
      taxable,
      tax_category: taxCategory,
      discount_amount: input.discount_amount,
      markup_percent: input.markup_percent ?? null,
      total,
      source_pricebook_item_id: input.source_pricebook_item_id ?? null,
      source_pricebook_version: sourceVersion,
    });
  });

  return { ok: true, lines };
}

class PrepareLineError extends Error {
  constructor(public badItemId: string) {
    super(`pricebook item not found for tenant: ${badItemId}`);
  }
}

/** Computes document totals from prepared lines as if they were persisted. */
function totalsFromPrepared(lines: PreparedLine[], taxRate: number, docDiscount: number) {
  const asItems = lines.map(
    (l) =>
      ({
        id: "tmp",
        estimate_id: "tmp",
        tenant_id: "tmp",
        sort_order: l.sort_order,
        kind: l.kind as EstimateLineItem["kind"],
        option_group: l.option_group,
        is_selected: l.is_selected,
        name: l.name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        unit_cost: l.unit_cost,
        taxable: l.taxable,
        discount_amount: l.discount_amount,
        total: l.total,
        created_at: "",
      }) as EstimateLineItem
  );
  return computeEstimateTotals(asItems, taxRate, docDiscount);
}

// ─── Version snapshot + event helpers ─────────────────────────────────────────

export async function recordEstimateEvent(entry: {
  estimateId: string;
  tenantId: string;
  eventType: EstimateEventType;
  version?: number;
  actorUserId?: string | null;
  actorName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  recipientEmail?: string | null;
  previewMode?: boolean | null;
  testOverride?: boolean | null;
  providerMessageId?: string | null;
  errorDetail?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const { error } = await db.from("estimate_events").insert({
    estimate_id: entry.estimateId,
    tenant_id: entry.tenantId,
    event_type: entry.eventType,
    version: entry.version ?? null,
    actor_user_id: entry.actorUserId ?? null,
    actor_name: entry.actorName ?? null,
    ip: entry.ip ?? null,
    user_agent: entry.userAgent ?? null,
    recipient_email: entry.recipientEmail ?? null,
    preview_mode: entry.previewMode ?? null,
    test_override: entry.testOverride ?? null,
    provider_message_id: entry.providerMessageId ?? null,
    error_detail: entry.errorDetail ?? null,
    metadata: entry.metadata ?? null,
  });
  // Non-fatal — an event-log write must never break the action it records.
  if (error) console.error("[db] recordEstimateEvent:", error.message);
}

async function writeVersionSnapshot(
  estimate: Estimate,
  lines: EstimateLineItem[],
  versionType: EstimateVersionType,
  userId: string | null,
  reason?: string
): Promise<void> {
  const { error } = await db.from("estimate_versions").insert({
    estimate_id: estimate.id,
    tenant_id: estimate.tenant_id,
    version: estimate.version,
    version_type: versionType,
    snapshot: { estimate, line_items: lines },
    reason: reason ?? null,
    created_by: userId,
  });
  // A duplicate (estimate_id, version) means the snapshot already exists — fine.
  if (error && error.code !== PG_UNIQUE_VIOLATION) {
    console.error("[db] writeVersionSnapshot:", error.message);
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getEstimateById(
  id: string,
  tenantId: string,
  opts: { withLines?: boolean } = {}
): Promise<Estimate | undefined> {
  const { data, error } = await db
    .from("estimates")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`[db] getEstimateById: ${error.message}`);
  if (!data) return undefined;

  if (opts.withLines) {
    const lines = await getEstimateLines(id, tenantId);
    return mapEstimate(data as EstimateRow, lines);
  }
  return mapEstimate(data as EstimateRow);
}

export async function getEstimateLines(estimateId: string, tenantId: string): Promise<EstimateLineItem[]> {
  const { data, error } = await db
    .from("estimate_line_items")
    .select("*")
    .eq("estimate_id", estimateId)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`[db] getEstimateLines: ${error.message}`);
  return ((data ?? []) as LineRow[]).map(mapLine);
}

export async function listEstimates(tenantId: string, query: ListEstimatesQuery): Promise<Estimate[]> {
  let q = db.from("estimates").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
  if (query.status) q = q.eq("status", query.status);
  if (query.work_order_id) q = q.eq("work_order_id", query.work_order_id);
  if (query.q) {
    const term = query.q.replace(/[%_\\,()]/g, (c) => `\\${c}`);
    q = q.or(`title.ilike.%${term}%,estimate_number.ilike.%${term}%,customer_name.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`[db] listEstimates: ${error.message}`);
  return ((data ?? []) as EstimateRow[]).map((r) => mapEstimate(r));
}

export async function getEstimateVersions(estimateId: string, tenantId: string): Promise<EstimateVersion[]> {
  const { data, error } = await db
    .from("estimate_versions")
    .select("*")
    .eq("estimate_id", estimateId)
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false });
  if (error) throw new Error(`[db] getEstimateVersions: ${error.message}`);
  return (data ?? []) as EstimateVersion[];
}

export async function getEstimateEvents(estimateId: string, tenantId: string): Promise<EstimateEvent[]> {
  const { data, error } = await db
    .from("estimate_events")
    .select("*")
    .eq("estimate_id", estimateId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] getEstimateEvents: ${error.message}`);
  return (data ?? []) as EstimateEvent[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createEstimate(
  input: CreateEstimateInput,
  tenantId: string,
  userId: string
): Promise<{ ok: true; data: Estimate } | { ok: false; badItemId: string }> {
  let prepared: PreparedLine[];
  try {
    const result = await prepareLines(input.line_items, tenantId);
    if (!result.ok) return { ok: false, badItemId: result.badItemId };
    prepared = result.lines;
  } catch (e) {
    if (e instanceof PrepareLineError) return { ok: false, badItemId: e.badItemId };
    throw e;
  }

  const totals = totalsFromPrepared(prepared, input.tax_rate, input.discount_amount);
  const estimateNumber = await nextDocumentNumber(tenantId, "estimate");

  const { data, error } = await db
    .from("estimates")
    .insert({
      tenant_id: tenantId,
      estimate_handoff_id: input.estimate_handoff_id ?? null,
      work_order_id: input.work_order_id ?? null,
      property_id: input.property_id ?? null,
      ghl_contact_id: input.ghl_contact_id ?? null,
      ghl_opportunity_id: input.ghl_opportunity_id ?? null,
      estimate_number: estimateNumber,
      title: input.title,
      status: EstimateStatus.DRAFT,
      customer_name: input.customer_name,
      customer_email: input.customer_email ?? null,
      customer_phone: input.customer_phone ?? null,
      customer_address: input.customer_address ?? null,
      issue_date: input.issue_date ?? new Date().toISOString().slice(0, 10),
      expires_at: input.expires_at ?? null,
      assigned_estimator_id: input.assigned_estimator_id ?? null,
      proposal_template: input.proposal_template,
      subtotal: totals.subtotal,
      tax_rate: input.tax_rate,
      tax_amount: totals.tax_amount,
      discount_amount: totals.discount_amount,
      total: totals.total,
      internal_notes: input.internal_notes ?? null,
      customer_notes: input.customer_notes ?? null,
      terms: input.terms ?? null,
      version: 1,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`[db] createEstimate: ${error.message}`);

  const estimateRow = data as EstimateRow;
  const insertedLines = await insertLines(estimateRow.id, tenantId, prepared);
  const estimate = mapEstimate(estimateRow, insertedLines);

  await writeVersionSnapshot(estimate, insertedLines, "draft", userId);
  await recordEstimateEvent({
    estimateId: estimate.id,
    tenantId,
    eventType: "created",
    version: 1,
    actorUserId: userId,
    metadata: { estimate_number: estimateNumber },
  });

  return { ok: true, data: estimate };
}

async function insertLines(estimateId: string, tenantId: string, lines: PreparedLine[]): Promise<EstimateLineItem[]> {
  if (lines.length === 0) return [];
  const { data, error } = await db
    .from("estimate_line_items")
    .insert(lines.map((l) => ({ ...l, estimate_id: estimateId, tenant_id: tenantId })))
    .select("*");
  if (error) throw new Error(`[db] insertLines: ${error.message}`);
  return ((data ?? []) as LineRow[]).map(mapLine).sort((a, b) => a.sort_order - b.sort_order);
}

// ─── Patch (draft/ready only) ─────────────────────────────────────────────────

export async function patchEstimate(
  id: string,
  patch: PatchEstimateInput,
  tenantId: string,
  userId: string
): Promise<EstimateWriteResult | { ok: false; badItemId: string }> {
  const existing = await getEstimateById(id, tenantId);
  if (!existing) return { ok: false, notFound: true };
  if (existing.version !== patch.version) {
    return { ok: false, conflict: true, currentVersion: existing.version };
  }
  if (!isEditable(existing.status)) {
    return { ok: false, notEditable: true, status: existing.status };
  }

  // Prepare replacement lines if provided; otherwise keep the current ones.
  let preparedLines: PreparedLine[] | null = null;
  if (patch.line_items !== undefined) {
    try {
      const result = await prepareLines(patch.line_items, tenantId);
      if (!result.ok) return { ok: false, badItemId: result.badItemId };
      preparedLines = result.lines;
    } catch (e) {
      if (e instanceof PrepareLineError) return { ok: false, badItemId: e.badItemId };
      throw e;
    }
  }

  const taxRate = patch.tax_rate ?? existing.tax_rate;
  const docDiscount = patch.discount_amount ?? existing.discount_amount;

  const totals = preparedLines
    ? totalsFromPrepared(preparedLines, taxRate, docDiscount)
    : computeEstimateTotals(await getEstimateLines(id, tenantId), taxRate, docDiscount);

  const updatePayload: Record<string, unknown> = {
    version: existing.version + 1,
    subtotal: totals.subtotal,
    tax_amount: totals.tax_amount,
    discount_amount: totals.discount_amount,
    total: totals.total,
    tax_rate: taxRate,
  };
  const fields: Array<keyof PatchEstimateInput> = [
    "title", "customer_name", "customer_email", "customer_phone", "customer_address",
    "issue_date", "expires_at", "assigned_estimator_id", "proposal_template",
    "internal_notes", "customer_notes", "terms",
  ];
  for (const f of fields) {
    if (patch[f] !== undefined) updatePayload[f] = patch[f];
  }

  // Optimistic-concurrency guarded update.
  const { data, error } = await db
    .from("estimates")
    .update(updatePayload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("version", patch.version)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] patchEstimate: ${error.message}`);
  if (!data) {
    // Lost the race — re-read to report the fresh version.
    const fresh = await getEstimateById(id, tenantId);
    return fresh
      ? { ok: false, conflict: true, currentVersion: fresh.version }
      : { ok: false, notFound: true };
  }

  const estimateRow = data as EstimateRow;

  if (preparedLines) {
    const { error: delErr } = await db
      .from("estimate_line_items")
      .delete()
      .eq("estimate_id", id)
      .eq("tenant_id", tenantId);
    if (delErr) throw new Error(`[db] patchEstimate delete lines: ${delErr.message}`);
    await insertLines(id, tenantId, preparedLines);
  }

  const lines = await getEstimateLines(id, tenantId);
  const estimate = mapEstimate(estimateRow, lines);

  await writeVersionSnapshot(estimate, lines, "draft", userId);
  await recordEstimateEvent({
    estimateId: id,
    tenantId,
    eventType: "updated",
    version: estimate.version,
    actorUserId: userId,
  });

  return { ok: true, data: estimate };
}

// ─── Status transitions (draft/ready/void) ────────────────────────────────────

export async function transitionEstimate(
  id: string,
  to: EstimateStatus,
  expectedVersion: number,
  tenantId: string,
  userId: string
): Promise<EstimateWriteResult> {
  const existing = await getEstimateById(id, tenantId);
  if (!existing) return { ok: false, notFound: true };
  if (existing.version !== expectedVersion) {
    return { ok: false, conflict: true, currentVersion: existing.version };
  }
  if (!canTransition(existing.status, to)) {
    return { ok: false, invalidTransition: true, from: existing.status, to };
  }

  const patch: Record<string, unknown> = { status: to };
  if (to === EstimateStatus.VOIDED) patch.voided_at = new Date().toISOString();

  const { data, error } = await db
    .from("estimates")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("version", expectedVersion)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] transitionEstimate: ${error.message}`);
  if (!data) {
    const fresh = await getEstimateById(id, tenantId);
    return fresh ? { ok: false, conflict: true, currentVersion: fresh.version } : { ok: false, notFound: true };
  }

  await recordEstimateEvent({
    estimateId: id,
    tenantId,
    eventType: to === EstimateStatus.VOIDED ? "voided" : "updated",
    version: existing.version,
    actorUserId: userId,
    metadata: { to },
  });

  return { ok: true, data: mapEstimate(data as EstimateRow) };
}

// ─── Public token resolution (cross-tenant — the token IS the credential) ─────
/**
 * Resolves an estimate by its hashed public token. Intentionally NOT
 * tenant-scoped: there is no ambient session on the public route, so the token
 * possession is the only credential and the tenant is DERIVED from the found
 * row (never trusted from the caller). Returns undefined for any miss so the
 * public route can surface one generic error with no oracle.
 */
export async function resolveEstimateByTokenHash(
  tokenHash: string,
  opts: { withLines?: boolean } = {}
): Promise<Estimate | undefined> {
  const { data, error } = await db
    .from("estimates")
    .select("*")
    .eq("public_token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(`[db] resolveEstimateByTokenHash: ${error.message}`);
  if (!data) return undefined;

  const row = data as EstimateRow;
  if (opts.withLines) {
    const lines = await getEstimateLines(row.id, row.tenant_id);
    return mapEstimate(row, lines);
  }
  return mapEstimate(row);
}

/**
 * Marks a sent estimate as viewed on first customer open. Idempotent: sets
 * viewed_at once and advances sent→viewed; a no-op for any other status.
 */
export async function markEstimateViewed(
  estimateId: string,
  tenantId: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {}
): Promise<void> {
  const { data, error } = await db
    .from("estimates")
    .update({ status: EstimateStatus.VIEWED, viewed_at: new Date().toISOString() })
    .eq("id", estimateId)
    .eq("tenant_id", tenantId)
    .eq("status", EstimateStatus.SENT) // only advance from sent; leave viewed/accepted alone
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[db] markEstimateViewed:", error.message);
    return;
  }
  if (data) {
    await recordEstimateEvent({
      estimateId,
      tenantId,
      eventType: "viewed",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }
}

export { mapEstimate, mapLine };
export type { EstimateRow, LineRow };
