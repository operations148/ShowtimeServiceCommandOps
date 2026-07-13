import { db } from "@/lib/db/client";
import {
  ChangeOrderStatus,
  type ChangeOrder,
  type ChangeOrderLineItem,
  type ChangeOrderVersion,
  type ChangeOrderEvent,
  type ChangeOrderEventType,
  type ChangeOrderVersionType,
} from "@/types/change-order";
import type {
  CreateChangeOrderInput,
  PatchChangeOrderInput,
  ChangeOrderLineInput,
  ListChangeOrdersQuery,
} from "@/lib/validation/change-order";
import { nextDocumentNumber } from "./document-numbers";
import { computeChangeOrderTotals } from "@/lib/change-orders/totals";
import { canTransition } from "@/lib/change-orders/state-machine";
import { lineTotal } from "@/lib/money/money";

// ─── Row types ────────────────────────────────────────────────────────────────

type ChangeOrderRow = {
  id: string;
  tenant_id: string;
  work_order_id: string;
  change_order_number: string;
  status: string;
  reason: string;
  scope_description: string | null;
  customer_name: string;
  customer_email: string | null;
  cost_impact_cents: number;
  price_impact_cents: number;
  tax_rate: number | string;
  tax_impact_cents: number;
  total_impact_cents: number;
  schedule_impact_days: number | null;
  schedule_impact_note: string | null;
  schedule_impact_applied_at: string | null;
  schedule_impact_applied_by: string | null;
  blocks_closeout: boolean;
  internal_notes: string | null;
  customer_notes: string | null;
  version: number;
  sent_version: number | null;
  accepted_version: number | null;
  public_token_hash: string | null;
  token_expires_at: string | null;
  token_revoked_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  voided_at: string | null;
  reject_reason: string | null;
  accepted_by_name: string | null;
  accepted_signature: string | null;
  accepted_ip: string | null;
  accepted_user_agent: string | null;
  locked_at: string | null;
  locked_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type LineRow = {
  id: string;
  change_order_id: string;
  tenant_id: string;
  sort_order: number;
  name: string;
  description: string | null;
  unit: string | null;
  quantity: number | string;
  unit_price: number;
  unit_cost: number;
  taxable: boolean;
  discount_amount: number;
  total: number;
  source_pricebook_item_id: string | null;
  source_pricebook_version: number | null;
  created_at: string;
};

function mapLine(row: LineRow): ChangeOrderLineItem {
  return {
    id: row.id,
    change_order_id: row.change_order_id,
    tenant_id: row.tenant_id,
    sort_order: row.sort_order,
    name: row.name,
    description: row.description,
    unit: row.unit,
    quantity: Number(row.quantity),
    unit_price: row.unit_price,
    unit_cost: row.unit_cost,
    taxable: row.taxable,
    discount_amount: row.discount_amount,
    total: row.total,
    source_pricebook_item_id: row.source_pricebook_item_id,
    source_pricebook_version: row.source_pricebook_version,
    created_at: row.created_at,
  };
}

function mapChangeOrder(row: ChangeOrderRow, lines?: ChangeOrderLineItem[]): ChangeOrder {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    work_order_id: row.work_order_id,
    change_order_number: row.change_order_number,
    status: row.status as ChangeOrderStatus,
    reason: row.reason,
    scope_description: row.scope_description,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    cost_impact_cents: row.cost_impact_cents,
    price_impact_cents: row.price_impact_cents,
    tax_rate: Number(row.tax_rate),
    tax_impact_cents: row.tax_impact_cents,
    total_impact_cents: row.total_impact_cents,
    schedule_impact_days: row.schedule_impact_days,
    schedule_impact_note: row.schedule_impact_note,
    schedule_impact_applied_at: row.schedule_impact_applied_at,
    schedule_impact_applied_by: row.schedule_impact_applied_by,
    blocks_closeout: row.blocks_closeout,
    internal_notes: row.internal_notes,
    customer_notes: row.customer_notes,
    version: row.version,
    sent_version: row.sent_version,
    accepted_version: row.accepted_version,
    token_expires_at: row.token_expires_at,
    token_revoked_at: row.token_revoked_at,
    has_active_token: row.public_token_hash !== null && row.token_revoked_at === null,
    sent_at: row.sent_at,
    viewed_at: row.viewed_at,
    accepted_at: row.accepted_at,
    rejected_at: row.rejected_at,
    voided_at: row.voided_at,
    reject_reason: row.reject_reason,
    accepted_by_name: row.accepted_by_name,
    accepted_signature: row.accepted_signature,
    locked_at: row.locked_at,
    locked_by: row.locked_by,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    line_items: lines,
  };
}

const PG_UNIQUE_VIOLATION = "23505";

// ─── Result unions ────────────────────────────────────────────────────────────

export type ChangeOrderWriteResult =
  | { ok: true; data: ChangeOrder }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true; currentVersion: number }
  | { ok: false; notEditable: true; status: ChangeOrderStatus }
  | { ok: false; invalidTransition: true; from: ChangeOrderStatus; to: ChangeOrderStatus }
  | { ok: false; badItemId: string };

// ─── Pricebook-aware line snapshotting (mirrors estimates) ────────────────────

type PreparedLine = {
  sort_order: number;
  name: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  taxable: boolean;
  discount_amount: number;
  total: number;
  source_pricebook_item_id: string | null;
  source_pricebook_version: number | null;
};

class PrepareLineError extends Error {
  constructor(public badItemId: string) {
    super(`pricebook item not found for tenant: ${badItemId}`);
  }
}

async function prepareLines(inputs: ChangeOrderLineInput[], tenantId: string): Promise<PreparedLine[]> {
  const pbIds = [...new Set(inputs.map((l) => l.source_pricebook_item_id).filter(Boolean))] as string[];
  const pbById = new Map<
    string,
    { name: string; description: string | null; unit: string | null; customer_price: number; internal_cost: number; taxable: boolean; version: number }
  >();

  if (pbIds.length > 0) {
    const { data, error } = await db
      .from("pricebook_items")
      .select("id, name, description, unit, customer_price, internal_cost, taxable, version")
      .eq("tenant_id", tenantId)
      .in("id", pbIds);
    if (error) throw new Error(`[db] prepareLines pricebook fetch: ${error.message}`);
    for (const row of (data ?? []) as Array<{ id: string } & NonNullable<ReturnType<typeof pbById.get>>>) {
      pbById.set(row.id, row);
    }
  }

  return inputs.map((input, index) => {
    let name = input.name;
    let description = input.description ?? null;
    let unit = input.unit ?? null;
    let unitPrice = input.unit_price;
    let unitCost = input.unit_cost ?? 0;
    let taxable = input.taxable;
    let sourceVersion: number | null = null;

    if (input.source_pricebook_item_id) {
      const pb = pbById.get(input.source_pricebook_item_id);
      if (!pb) throw new PrepareLineError(input.source_pricebook_item_id);
      name = pb.name;
      description = pb.description;
      unit = pb.unit;
      unitPrice = pb.customer_price;
      unitCost = pb.internal_cost;
      taxable = pb.taxable;
      sourceVersion = pb.version;
    }

    const total = lineTotal({ quantity: input.quantity, unit_price: unitPrice, discount_amount: input.discount_amount });

    return {
      sort_order: index,
      name,
      description,
      unit,
      quantity: input.quantity,
      unit_price: unitPrice,
      unit_cost: unitCost,
      taxable,
      discount_amount: input.discount_amount,
      total,
      source_pricebook_item_id: input.source_pricebook_item_id ?? null,
      source_pricebook_version: sourceVersion,
    };
  });
}

function totalsFromPrepared(lines: PreparedLine[], taxRate: number) {
  const asItems = lines.map(
    (l) =>
      ({
        id: "tmp",
        change_order_id: "tmp",
        tenant_id: "tmp",
        sort_order: l.sort_order,
        name: l.name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        unit_cost: l.unit_cost,
        taxable: l.taxable,
        discount_amount: l.discount_amount,
        total: l.total,
        created_at: "",
      }) as ChangeOrderLineItem
  );
  return computeChangeOrderTotals(asItems, taxRate);
}

// ─── Event + version helpers ───────────────────────────────────────────────────

export async function recordChangeOrderEvent(entry: {
  changeOrderId: string;
  tenantId: string;
  eventType: ChangeOrderEventType;
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
  const { error } = await db.from("change_order_events").insert({
    change_order_id: entry.changeOrderId,
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
  if (error) console.error("[db] recordChangeOrderEvent:", error.message);
}

async function writeVersionSnapshot(
  co: ChangeOrder,
  lines: ChangeOrderLineItem[],
  versionType: ChangeOrderVersionType,
  userId: string | null,
  reason?: string
): Promise<void> {
  const { error } = await db.from("change_order_versions").insert({
    change_order_id: co.id,
    tenant_id: co.tenant_id,
    version: co.version,
    version_type: versionType,
    snapshot: { changeOrder: co, line_items: lines },
    reason: reason ?? null,
    created_by: userId,
  });
  if (error && error.code !== PG_UNIQUE_VIOLATION) {
    console.error("[db] writeVersionSnapshot:", error.message);
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getChangeOrderById(
  id: string,
  tenantId: string,
  opts: { withLines?: boolean } = {}
): Promise<ChangeOrder | undefined> {
  const { data, error } = await db
    .from("change_orders")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`[db] getChangeOrderById: ${error.message}`);
  if (!data) return undefined;

  if (opts.withLines) {
    const lines = await getChangeOrderLines(id, tenantId);
    return mapChangeOrder(data as ChangeOrderRow, lines);
  }
  return mapChangeOrder(data as ChangeOrderRow);
}

export async function getChangeOrderLines(changeOrderId: string, tenantId: string): Promise<ChangeOrderLineItem[]> {
  const { data, error } = await db
    .from("change_order_line_items")
    .select("*")
    .eq("change_order_id", changeOrderId)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`[db] getChangeOrderLines: ${error.message}`);
  return ((data ?? []) as LineRow[]).map(mapLine);
}

export async function listChangeOrders(tenantId: string, query: ListChangeOrdersQuery): Promise<ChangeOrder[]> {
  let q = db.from("change_orders").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
  if (query.status) q = q.eq("status", query.status);
  if (query.work_order_id) q = q.eq("work_order_id", query.work_order_id);
  if (query.q) {
    const term = query.q.replace(/[%_\\,()]/g, (c) => `\\${c}`);
    q = q.or(`reason.ilike.%${term}%,change_order_number.ilike.%${term}%,customer_name.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`[db] listChangeOrders: ${error.message}`);
  return ((data ?? []) as ChangeOrderRow[]).map((r) => mapChangeOrder(r));
}

export async function getChangeOrderVersions(changeOrderId: string, tenantId: string): Promise<ChangeOrderVersion[]> {
  const { data, error } = await db
    .from("change_order_versions")
    .select("*")
    .eq("change_order_id", changeOrderId)
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false });
  if (error) throw new Error(`[db] getChangeOrderVersions: ${error.message}`);
  return (data ?? []) as ChangeOrderVersion[];
}

export async function getChangeOrderEvents(changeOrderId: string, tenantId: string): Promise<ChangeOrderEvent[]> {
  const { data, error } = await db
    .from("change_order_events")
    .select("*")
    .eq("change_order_id", changeOrderId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] getChangeOrderEvents: ${error.message}`);
  return (data ?? []) as ChangeOrderEvent[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createChangeOrder(
  workOrderId: string,
  input: CreateChangeOrderInput,
  tenantId: string,
  userId: string
): Promise<{ ok: true; data: ChangeOrder } | { ok: false; badItemId: string } | { ok: false; workOrderNotFound: true }> {
  const { data: wo } = await db.from("work_orders").select("id, customer_notes").eq("id", workOrderId).eq("tenant_id", tenantId).maybeSingle();
  if (!wo) return { ok: false, workOrderNotFound: true };

  // Resolve customer name/email from the work order's property (best-effort snapshot).
  const { data: woJoined } = await db
    .from("work_orders")
    .select("properties:property_id(customer_name)")
    .eq("id", workOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const joinedProp = (woJoined as { properties?: { customer_name?: string } | { customer_name?: string }[] | null } | null)?.properties;
  const resolvedCustomerName = Array.isArray(joinedProp) ? joinedProp[0]?.customer_name : joinedProp?.customer_name;

  let prepared: PreparedLine[];
  try {
    prepared = await prepareLines(input.line_items, tenantId);
  } catch (e) {
    if (e instanceof PrepareLineError) return { ok: false, badItemId: e.badItemId };
    throw e;
  }

  const totals = totalsFromPrepared(prepared, input.tax_rate);
  const changeOrderNumber = await nextDocumentNumber(tenantId, "change_order");

  const { data, error } = await db
    .from("change_orders")
    .insert({
      tenant_id: tenantId,
      work_order_id: workOrderId,
      change_order_number: changeOrderNumber,
      status: ChangeOrderStatus.DRAFT,
      reason: input.reason,
      scope_description: input.scope_description ?? null,
      customer_name: resolvedCustomerName ?? "Customer",
      customer_email: input.customer_email ?? null,
      cost_impact_cents: totals.cost_impact_cents,
      price_impact_cents: totals.price_impact_cents,
      tax_rate: input.tax_rate,
      tax_impact_cents: totals.tax_impact_cents,
      total_impact_cents: totals.total_impact_cents,
      schedule_impact_days: input.schedule_impact_days ?? null,
      schedule_impact_note: input.schedule_impact_note ?? null,
      blocks_closeout: input.blocks_closeout,
      internal_notes: input.internal_notes ?? null,
      customer_notes: input.customer_notes ?? null,
      version: 1,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`[db] createChangeOrder: ${error.message}`);

  const coRow = data as ChangeOrderRow;
  const insertedLines = await insertLines(coRow.id, tenantId, prepared);
  const co = mapChangeOrder(coRow, insertedLines);

  await writeVersionSnapshot(co, insertedLines, "draft", userId);
  await recordChangeOrderEvent({
    changeOrderId: co.id,
    tenantId,
    eventType: "created",
    version: 1,
    actorUserId: userId,
    metadata: { change_order_number: changeOrderNumber },
  });

  return { ok: true, data: co };
}

async function insertLines(changeOrderId: string, tenantId: string, lines: PreparedLine[]): Promise<ChangeOrderLineItem[]> {
  if (lines.length === 0) return [];
  const { data, error } = await db
    .from("change_order_line_items")
    .insert(lines.map((l) => ({ ...l, change_order_id: changeOrderId, tenant_id: tenantId })))
    .select("*");
  if (error) throw new Error(`[db] insertLines: ${error.message}`);
  return ((data ?? []) as LineRow[]).map(mapLine).sort((a, b) => a.sort_order - b.sort_order);
}

// ─── Patch (draft only) ────────────────────────────────────────────────────────

export async function patchChangeOrder(
  id: string,
  patch: PatchChangeOrderInput,
  tenantId: string,
  userId: string
): Promise<ChangeOrderWriteResult> {
  const existing = await getChangeOrderById(id, tenantId);
  if (!existing) return { ok: false, notFound: true };
  if (existing.version !== patch.version) return { ok: false, conflict: true, currentVersion: existing.version };
  if (existing.status !== ChangeOrderStatus.DRAFT) {
    return { ok: false, notEditable: true, status: existing.status };
  }

  let preparedLines: PreparedLine[] | null = null;
  if (patch.line_items !== undefined) {
    try {
      preparedLines = await prepareLines(patch.line_items, tenantId);
    } catch (e) {
      if (e instanceof PrepareLineError) return { ok: false, badItemId: e.badItemId };
      throw e;
    }
  }

  const taxRate = patch.tax_rate ?? existing.tax_rate;
  const totals = preparedLines
    ? totalsFromPrepared(preparedLines, taxRate)
    : computeChangeOrderTotals(await getChangeOrderLines(id, tenantId), taxRate);

  const updatePayload: Record<string, unknown> = {
    version: existing.version + 1,
    tax_rate: taxRate,
    cost_impact_cents: totals.cost_impact_cents,
    price_impact_cents: totals.price_impact_cents,
    tax_impact_cents: totals.tax_impact_cents,
    total_impact_cents: totals.total_impact_cents,
  };
  const fields: Array<keyof PatchChangeOrderInput> = [
    "reason", "scope_description", "customer_name", "customer_email",
    "schedule_impact_days", "schedule_impact_note", "blocks_closeout",
    "internal_notes", "customer_notes",
  ];
  for (const f of fields) {
    if (patch[f] !== undefined) updatePayload[f] = patch[f];
  }

  const { data, error } = await db
    .from("change_orders")
    .update(updatePayload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("version", patch.version)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] patchChangeOrder: ${error.message}`);
  if (!data) {
    const fresh = await getChangeOrderById(id, tenantId);
    return fresh ? { ok: false, conflict: true, currentVersion: fresh.version } : { ok: false, notFound: true };
  }

  if (preparedLines) {
    const { error: delErr } = await db.from("change_order_line_items").delete().eq("change_order_id", id).eq("tenant_id", tenantId);
    if (delErr) throw new Error(`[db] patchChangeOrder delete lines: ${delErr.message}`);
    await insertLines(id, tenantId, preparedLines);
  }

  const lines = await getChangeOrderLines(id, tenantId);
  const co = mapChangeOrder(data as ChangeOrderRow, lines);

  await writeVersionSnapshot(co, lines, "draft", userId);
  await recordChangeOrderEvent({ changeOrderId: id, tenantId, eventType: "updated", version: co.version, actorUserId: userId });

  return { ok: true, data: co };
}

// ─── Void transition (admin) ───────────────────────────────────────────────────

export async function voidChangeOrder(
  id: string,
  expectedVersion: number,
  tenantId: string,
  userId: string
): Promise<ChangeOrderWriteResult> {
  const existing = await getChangeOrderById(id, tenantId);
  if (!existing) return { ok: false, notFound: true };
  if (existing.version !== expectedVersion) return { ok: false, conflict: true, currentVersion: existing.version };
  if (!canTransition(existing.status, ChangeOrderStatus.VOIDED)) {
    return { ok: false, invalidTransition: true, from: existing.status, to: ChangeOrderStatus.VOIDED };
  }

  const { data, error } = await db
    .from("change_orders")
    .update({ status: ChangeOrderStatus.VOIDED, voided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("version", expectedVersion)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] voidChangeOrder: ${error.message}`);
  if (!data) {
    const fresh = await getChangeOrderById(id, tenantId);
    return fresh ? { ok: false, conflict: true, currentVersion: fresh.version } : { ok: false, notFound: true };
  }

  await recordChangeOrderEvent({ changeOrderId: id, tenantId, eventType: "voided", version: expectedVersion, actorUserId: userId });
  return { ok: true, data: mapChangeOrder(data as ChangeOrderRow) };
}

// ─── Public token resolution (cross-tenant — the token IS the credential) ─────

export async function resolveChangeOrderByTokenHash(
  tokenHash: string,
  opts: { withLines?: boolean } = {}
): Promise<ChangeOrder | undefined> {
  const { data, error } = await db.from("change_orders").select("*").eq("public_token_hash", tokenHash).maybeSingle();
  if (error) throw new Error(`[db] resolveChangeOrderByTokenHash: ${error.message}`);
  if (!data) return undefined;

  const row = data as ChangeOrderRow;
  if (opts.withLines) {
    const lines = await getChangeOrderLines(row.id, row.tenant_id);
    return mapChangeOrder(row, lines);
  }
  return mapChangeOrder(row);
}

export async function markChangeOrderViewed(
  changeOrderId: string,
  tenantId: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {}
): Promise<void> {
  const { data, error } = await db
    .from("change_orders")
    .update({ status: ChangeOrderStatus.VIEWED, viewed_at: new Date().toISOString() })
    .eq("id", changeOrderId)
    .eq("tenant_id", tenantId)
    .eq("status", ChangeOrderStatus.SENT)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[db] markChangeOrderViewed:", error.message);
    return;
  }
  if (data) {
    await recordChangeOrderEvent({ changeOrderId, tenantId, eventType: "viewed", ip: ctx.ip, userAgent: ctx.userAgent });
  }
}

export { mapChangeOrder, mapLine };
export type { ChangeOrderRow, LineRow };
