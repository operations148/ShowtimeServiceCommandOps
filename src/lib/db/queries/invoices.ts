import { db } from '@/lib/db/client'
import {
  Invoice,
  InvoiceStatus,
  InvoiceLineItem,
  InvoiceEvent,
  InvoiceEventType,
  InvoiceKind,
} from '@/types/invoice'
import {
  isEditable,
  isVoidable,
  canTransition,
} from '@/lib/invoices/state-machine'
import { calcDocumentTotals, depositAmount, amountDue } from '@/lib/money/money'
import { generatePublicToken } from '@/lib/security/public-document-token'
import { nextDocumentNumber } from './document-numbers'
import type {
  CreateInvoiceInput,
  PatchInvoiceInput,
  InvoiceLineInput,
  ListInvoicesQuery,
} from '@/lib/validation/invoice'

// ─── Raw DB row ────────────────────────────────────────────────────────────────

export type InvoiceRow = {
  id: string
  tenant_id: string
  estimate_handoff_id: string | null
  estimate_id: string | null
  work_order_id: string | null
  property_id: string | null
  ghl_contact_id: string | null
  ghl_opportunity_id: string | null
  invoice_number: string
  title: string
  status: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  customer_address: string | null
  issue_date: string
  due_date: string | null
  sent_at: string | null
  viewed_at: string | null
  paid_at: string | null
  subtotal: number
  tax_rate: number | string
  tax_amount: number
  discount_amount: number
  total: number
  amount_paid: number
  amount_due: number
  deposit_percent: number | string
  deposit_amount: number
  deposit_required: boolean
  notes: string | null
  terms: string | null
  payment_instructions: string | null
  stripe_payment_intent_id: string | null
  stripe_payment_link: string | null
  stripe_checkout_session_id: string | null
  public_token: string
  // Phase 6 columns (nullable/defaulted — older rows predate them)
  public_token_hash?: string | null
  token_expires_at?: string | null
  token_revoked_at?: string | null
  version?: number | null
  source_change_order_id?: string | null
  source_snapshot?: Record<string, unknown> | null
  invoice_kind?: string | null
  milestone_label?: string | null
  voided_at?: string | null
  voided_by?: string | null
  void_reason?: string | null
  refunded_at?: string | null
  amount_refunded?: number | null
  credited_amount?: number | null
  credit_reason?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export function mapInvoiceRow(row: InvoiceRow, lines?: InvoiceLineItem[]): Invoice {
  return {
    id:                         row.id,
    tenant_id:                  row.tenant_id,
    estimate_handoff_id:        row.estimate_handoff_id ?? undefined,
    estimate_id:                row.estimate_id ?? undefined,
    work_order_id:              row.work_order_id ?? undefined,
    property_id:                row.property_id ?? undefined,
    ghl_contact_id:             row.ghl_contact_id ?? undefined,
    ghl_opportunity_id:         row.ghl_opportunity_id ?? undefined,
    invoice_number:             row.invoice_number,
    title:                      row.title,
    status:                     row.status as InvoiceStatus,
    customer_name:              row.customer_name,
    customer_email:             row.customer_email ?? undefined,
    customer_phone:             row.customer_phone ?? undefined,
    customer_address:           row.customer_address ?? undefined,
    issue_date:                 row.issue_date,
    due_date:                   row.due_date ?? undefined,
    sent_at:                    row.sent_at ?? undefined,
    viewed_at:                  row.viewed_at ?? undefined,
    paid_at:                    row.paid_at ?? undefined,
    subtotal:                   row.subtotal,
    tax_rate:                   Number(row.tax_rate),
    tax_amount:                 row.tax_amount,
    discount_amount:            row.discount_amount,
    total:                      row.total,
    amount_paid:                row.amount_paid,
    amount_due:                 row.amount_due,
    deposit_percent:            Number(row.deposit_percent),
    deposit_amount:             row.deposit_amount,
    deposit_required:           row.deposit_required,
    notes:                      row.notes ?? undefined,
    terms:                      row.terms ?? undefined,
    payment_instructions:       row.payment_instructions ?? undefined,
    stripe_payment_intent_id:   row.stripe_payment_intent_id ?? undefined,
    stripe_payment_link:        row.stripe_payment_link ?? undefined,
    stripe_checkout_session_id: row.stripe_checkout_session_id ?? undefined,
    public_token:               row.public_token,
    public_token_hash:          row.public_token_hash ?? null,
    token_expires_at:           row.token_expires_at ?? null,
    token_revoked_at:           row.token_revoked_at ?? null,
    version:                    row.version ?? 1,
    source_change_order_id:     row.source_change_order_id ?? null,
    source_snapshot:            row.source_snapshot ?? null,
    invoice_kind:               (row.invoice_kind as InvoiceKind | null) ?? 'standard',
    milestone_label:            row.milestone_label ?? null,
    voided_at:                  row.voided_at ?? null,
    voided_by:                  row.voided_by ?? null,
    void_reason:                row.void_reason ?? null,
    refunded_at:                row.refunded_at ?? null,
    amount_refunded:            row.amount_refunded ?? 0,
    credited_amount:            row.credited_amount ?? 0,
    credit_reason:              row.credit_reason ?? null,
    created_by:                 row.created_by ?? undefined,
    created_at:                 row.created_at,
    updated_at:                 row.updated_at,
    line_items:                 lines,
  }
}

type LineRow = {
  id: string
  invoice_id: string
  tenant_id: string
  sort_order: number
  description: string
  details: string | null
  quantity: number | string
  unit_price: number
  total: number
  created_at: string
}

function mapLine(row: LineRow): InvoiceLineItem {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    tenant_id: row.tenant_id,
    sort_order: row.sort_order,
    description: row.description,
    details: row.details,
    quantity: Number(row.quantity),
    unit_price: row.unit_price,
    total: row.total,
    created_at: row.created_at,
  }
}

// ─── Result types ──────────────────────────────────────────────────────────────

export type InvoiceWriteResult =
  | { ok: true; data: Invoice }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true; currentVersion: number }
  | { ok: false; notEditable: true; status: InvoiceStatus }

export type InvoiceVoidResult =
  | { ok: true; data: Invoice }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true; currentVersion: number }
  | { ok: false; notVoidable: true; status: InvoiceStatus }

export type InvoiceTransitionResult =
  | { ok: true; data: Invoice }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true; currentVersion: number }
  | { ok: false; invalidTransition: true; from: InvoiceStatus }

// ─── Reads ─────────────────────────────────────────────────────────────────────

export async function getInvoiceById(
  id: string,
  tenantId: string,
  opts: { withLines?: boolean } = {},
): Promise<Invoice | undefined> {
  const { data, error } = await db
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw new Error(`[db] getInvoiceById: ${error.message}`)
  if (!data) return undefined

  const lines = opts.withLines ? await getInvoiceLines(id, tenantId) : undefined
  return mapInvoiceRow(data as unknown as InvoiceRow, lines)
}

export async function getInvoiceLines(
  invoiceId: string,
  tenantId: string,
): Promise<InvoiceLineItem[]> {
  const { data, error } = await db
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`[db] getInvoiceLines: ${error.message}`)
  return ((data ?? []) as LineRow[]).map(mapLine)
}

export async function listInvoices(
  tenantId: string,
  query: ListInvoicesQuery,
): Promise<Invoice[]> {
  let q = db
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (query.status) q = q.eq('status', query.status)
  if (query.work_order_id) q = q.eq('work_order_id', query.work_order_id)
  if (query.estimate_id) q = q.eq('estimate_id', query.estimate_id)
  if (query.invoice_kind) q = q.eq('invoice_kind', query.invoice_kind)
  if (query.q) {
    const term = query.q.replace(/[%_\\,()]/g, (c) => `\\${c}`)
    q = q.or(`invoice_number.ilike.%${term}%,customer_name.ilike.%${term}%,title.ilike.%${term}%`)
  }

  const { data, error } = await q
  if (error) throw new Error(`[db] listInvoices: ${error.message}`)
  return ((data ?? []) as unknown as InvoiceRow[]).map((r) => mapInvoiceRow(r))
}

export async function resolveInvoiceByTokenHash(
  tokenHash: string,
  opts: { withLines?: boolean } = {},
): Promise<Invoice | undefined> {
  const { data, error } = await db
    .from('invoices')
    .select('*')
    .eq('public_token_hash', tokenHash)
    .maybeSingle()

  if (error) throw new Error(`[db] resolveInvoiceByTokenHash: ${error.message}`)
  if (!data) return undefined

  const row = data as unknown as InvoiceRow
  const lines = opts.withLines ? await getInvoiceLines(row.id, row.tenant_id) : undefined
  return mapInvoiceRow(row, lines)
}

// ─── Create / edit (server-owned totals) ───────────────────────────────────────

/**
 * Server-computed totals: subtotal/discount/tax/total always derive from the
 * submitted line items via the money module — client-sent totals are never
 * trusted. Immutable source snapshot captured at creation.
 */
export async function createInvoiceDocument(
  input: CreateInvoiceInput,
  tenantId: string,
  userId: string | null,
  source?: {
    estimate_id?: string
    estimate_handoff_id?: string
    source_change_order_id?: string
    source_snapshot?: Record<string, unknown>
  },
): Promise<Invoice> {
  const totals = calcDocumentTotals({
    lines: input.line_items.map((l) => ({
      quantity: l.quantity,
      unit_price: l.unit_price,
      taxable: true,
    })),
    taxRate: input.tax_rate,
    documentDiscountCents: input.discount_amount,
  })

  const depositCents = input.deposit_required
    ? depositAmount(totals.total, input.deposit_percent)
    : 0

  const invoiceNumber = await nextDocumentNumber(tenantId, 'invoice')

  const { data, error } = await db
    .from('invoices')
    .insert({
      tenant_id:              tenantId,
      invoice_number:         invoiceNumber,
      title:                  input.title,
      status:                 InvoiceStatus.DRAFT,
      invoice_kind:           input.invoice_kind,
      milestone_label:        input.milestone_label ?? null,
      customer_name:          input.customer_name,
      customer_email:         input.customer_email ?? null,
      customer_phone:         input.customer_phone ?? null,
      customer_address:       input.customer_address ?? null,
      issue_date:             input.issue_date ?? new Date().toISOString().slice(0, 10),
      due_date:               input.due_date ?? null,
      subtotal:               totals.subtotal,
      tax_rate:               input.tax_rate,
      tax_amount:             totals.tax_amount,
      discount_amount:        totals.discount_amount,
      total:                  totals.total,
      amount_paid:            0,
      amount_due:             totals.total,
      deposit_percent:        input.deposit_percent,
      deposit_amount:         depositCents,
      deposit_required:       input.deposit_required,
      notes:                  input.notes ?? null,
      terms:                  input.terms ?? null,
      payment_instructions:   input.payment_instructions ?? null,
      work_order_id:          input.work_order_id ?? null,
      property_id:            input.property_id ?? null,
      ghl_opportunity_id:     input.ghl_opportunity_id ?? null,
      estimate_id:            source?.estimate_id ?? null,
      estimate_handoff_id:    source?.estimate_handoff_id ?? null,
      source_change_order_id: source?.source_change_order_id ?? null,
      source_snapshot:        source?.source_snapshot ?? null,
      version:                1,
      created_by:             userId,
    })
    .select('*')
    .single()

  if (error) throw new Error(`[db] createInvoiceDocument: ${error.message}`)

  const invoice = mapInvoiceRow(data as unknown as InvoiceRow)
  await insertLines(invoice.id, tenantId, input.line_items)
  invoice.line_items = await getInvoiceLines(invoice.id, tenantId)
  return invoice
}

async function insertLines(
  invoiceId: string,
  tenantId: string,
  lines: InvoiceLineInput[],
): Promise<void> {
  if (lines.length === 0) return
  const rows = lines.map((l, i) => ({
    invoice_id: invoiceId,
    tenant_id: tenantId,
    sort_order: i,
    description: l.description,
    details: l.details ?? null,
    quantity: l.quantity,
    unit_price: l.unit_price,
    total: Math.round(l.quantity * l.unit_price),
  }))
  const { error } = await db.from('invoice_line_items').insert(rows)
  if (error) throw new Error(`[db] insertInvoiceLines: ${error.message}`)
}

/** Draft/ready edits only; version-gated; totals recomputed server-side. */
export async function patchInvoiceDocument(
  id: string,
  patch: PatchInvoiceInput,
  tenantId: string,
): Promise<InvoiceWriteResult> {
  const existing = await getInvoiceById(id, tenantId, { withLines: true })
  if (!existing) return { ok: false, notFound: true }
  if (!isEditable(existing.status)) return { ok: false, notEditable: true, status: existing.status }
  if (existing.version !== patch.version) {
    return { ok: false, conflict: true, currentVersion: existing.version }
  }

  const payload: Record<string, unknown> = { version: patch.version + 1 }
  if (patch.title !== undefined) payload.title = patch.title
  if (patch.customer_name !== undefined) payload.customer_name = patch.customer_name
  if (patch.customer_email !== undefined) payload.customer_email = patch.customer_email
  if (patch.customer_phone !== undefined) payload.customer_phone = patch.customer_phone
  if (patch.customer_address !== undefined) payload.customer_address = patch.customer_address
  if (patch.issue_date !== undefined) payload.issue_date = patch.issue_date
  if (patch.due_date !== undefined) payload.due_date = patch.due_date
  if (patch.notes !== undefined) payload.notes = patch.notes
  if (patch.terms !== undefined) payload.terms = patch.terms
  if (patch.payment_instructions !== undefined) payload.payment_instructions = patch.payment_instructions
  if (patch.milestone_label !== undefined) payload.milestone_label = patch.milestone_label
  if (patch.deposit_required !== undefined) payload.deposit_required = patch.deposit_required
  if (patch.deposit_percent !== undefined) payload.deposit_percent = patch.deposit_percent

  // Recompute totals whenever anything financial changes.
  const financialChange =
    patch.line_items !== undefined ||
    patch.tax_rate !== undefined ||
    patch.discount_amount !== undefined ||
    patch.deposit_percent !== undefined ||
    patch.deposit_required !== undefined

  if (financialChange) {
    const lines = patch.line_items ?? (existing.line_items ?? []).map((l) => ({
      description: l.description,
      details: l.details ?? undefined,
      quantity: l.quantity,
      unit_price: l.unit_price,
    }))
    const taxRate = patch.tax_rate ?? existing.tax_rate
    const discount = patch.discount_amount ?? existing.discount_amount
    const depositRequired = patch.deposit_required ?? existing.deposit_required
    const depositPercent = patch.deposit_percent ?? existing.deposit_percent

    const totals = calcDocumentTotals({
      lines: lines.map((l) => ({ quantity: l.quantity, unit_price: l.unit_price, taxable: true })),
      taxRate,
      documentDiscountCents: discount,
    })
    payload.subtotal = totals.subtotal
    payload.tax_rate = taxRate
    payload.tax_amount = totals.tax_amount
    payload.discount_amount = totals.discount_amount
    payload.total = totals.total
    payload.amount_due = amountDue(totals.total, existing.amount_paid)
    payload.deposit_amount = depositRequired ? depositAmount(totals.total, depositPercent) : 0
  }

  const { data, error } = await db
    .from('invoices')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('version', patch.version)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`[db] patchInvoiceDocument: ${error.message}`)
  if (!data) {
    const fresh = await getInvoiceById(id, tenantId)
    return fresh
      ? { ok: false, conflict: true, currentVersion: fresh.version }
      : { ok: false, notFound: true }
  }

  if (patch.line_items !== undefined) {
    await db.from('invoice_line_items').delete().eq('invoice_id', id).eq('tenant_id', tenantId)
    await insertLines(id, tenantId, patch.line_items)
  }

  const lines = await getInvoiceLines(id, tenantId)
  return { ok: true, data: mapInvoiceRow(data as unknown as InvoiceRow, lines) }
}

// ─── Lifecycle actions ─────────────────────────────────────────────────────────

/** Admin transitions the state machine allows directly (draft ⇄ ready). */
export async function transitionInvoice(
  id: string,
  to: InvoiceStatus,
  expectedVersion: number,
  tenantId: string,
): Promise<InvoiceTransitionResult> {
  const existing = await getInvoiceById(id, tenantId)
  if (!existing) return { ok: false, notFound: true }
  if (existing.version !== expectedVersion) {
    return { ok: false, conflict: true, currentVersion: existing.version }
  }
  if (!canTransition(existing.status, to)) {
    return { ok: false, invalidTransition: true, from: existing.status }
  }

  const { data, error } = await db
    .from('invoices')
    .update({ status: to, version: expectedVersion + 1 })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('version', expectedVersion)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`[db] transitionInvoice: ${error.message}`)
  if (!data) {
    const fresh = await getInvoiceById(id, tenantId)
    return fresh
      ? { ok: false, conflict: true, currentVersion: fresh.version }
      : { ok: false, notFound: true }
  }
  return { ok: true, data: mapInvoiceRow(data as unknown as InvoiceRow) }
}

/** Void — unpaid documents only (money that moved goes through refund/credit). */
export async function voidInvoice(
  id: string,
  tenantId: string,
  userId: string,
  reason: string,
  expectedVersion: number,
): Promise<InvoiceVoidResult> {
  const existing = await getInvoiceById(id, tenantId)
  if (!existing) return { ok: false, notFound: true }
  if (existing.version !== expectedVersion) {
    return { ok: false, conflict: true, currentVersion: existing.version }
  }
  if (!isVoidable(existing.status)) {
    return { ok: false, notVoidable: true, status: existing.status }
  }

  const { data, error } = await db
    .from('invoices')
    .update({
      status: InvoiceStatus.VOID,
      voided_at: new Date().toISOString(),
      voided_by: userId,
      void_reason: reason,
      token_revoked_at: new Date().toISOString(),
      version: expectedVersion + 1,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('version', expectedVersion)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`[db] voidInvoice: ${error.message}`)
  if (!data) {
    const fresh = await getInvoiceById(id, tenantId)
    return fresh
      ? { ok: false, conflict: true, currentVersion: fresh.version }
      : { ok: false, notFound: true }
  }
  return { ok: true, data: mapInvoiceRow(data as unknown as InvoiceRow) }
}

// ─── Public token (ADR-0007: 256-bit random, SHA-256 at rest) ─────────────────

export async function issueInvoiceToken(
  id: string,
  tenantId: string,
  expiresInDays: number,
): Promise<{ token: string; expiresAt: string } | undefined> {
  const generated = generatePublicToken()
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('invoices')
    .update({
      public_token_hash: generated.hash,
      token_expires_at: expiresAt,
      token_revoked_at: null,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`[db] issueInvoiceToken: ${error.message}`)
  if (!data) return undefined
  return { token: generated.token, expiresAt }
}

export async function revokeInvoiceToken(id: string, tenantId: string): Promise<boolean> {
  const { data, error } = await db
    .from('invoices')
    .update({ token_revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')
    .maybeSingle()

  if (error) throw new Error(`[db] revokeInvoiceToken: ${error.message}`)
  return !!data
}

export async function markInvoiceViewed(
  id: string,
  tenantId: string,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const invoice = await getInvoiceById(id, tenantId)
  if (!invoice) return

  const patch: Record<string, unknown> = {}
  if (!invoice.viewed_at) patch.viewed_at = new Date().toISOString()
  if (invoice.status === InvoiceStatus.SENT && canTransition(invoice.status, InvoiceStatus.VIEWED)) {
    patch.status = InvoiceStatus.VIEWED
  }
  if (Object.keys(patch).length > 0) {
    const { error } = await db.from('invoices').update(patch).eq('id', id).eq('tenant_id', tenantId)
    if (error) console.error(`[db] markInvoiceViewed: ${error.message}`)
  }

  await recordInvoiceEvent({
    invoiceId: id,
    tenantId,
    eventType: 'viewed',
    ip: meta.ip ?? undefined,
    userAgent: meta.userAgent ?? undefined,
  })
}

// ─── Events (append-only activity/audit log) ───────────────────────────────────

export async function recordInvoiceEvent(entry: {
  invoiceId: string
  tenantId: string
  eventType: InvoiceEventType
  actorUserId?: string
  actorName?: string
  ip?: string
  userAgent?: string
  recipientEmail?: string
  previewMode?: boolean
  testOverride?: boolean
  providerMessageId?: string
  errorDetail?: string
  paymentId?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { error } = await db.from('invoice_events').insert({
    invoice_id: entry.invoiceId,
    tenant_id: entry.tenantId,
    event_type: entry.eventType,
    actor_user_id: entry.actorUserId ?? null,
    actor_name: entry.actorName ?? null,
    ip: entry.ip ?? null,
    user_agent: entry.userAgent ?? null,
    recipient_email: entry.recipientEmail ?? null,
    preview_mode: entry.previewMode ?? null,
    test_override: entry.testOverride ?? null,
    provider_message_id: entry.providerMessageId ?? null,
    error_detail: entry.errorDetail ?? null,
    payment_id: entry.paymentId ?? null,
    metadata: entry.metadata ?? null,
  })
  // Never fatal — an audit-log failure must not break the action it records.
  if (error) console.error(`[db] recordInvoiceEvent: ${error.message}`)
}

export async function getInvoiceEvents(
  invoiceId: string,
  tenantId: string,
): Promise<InvoiceEvent[]> {
  const { data, error } = await db
    .from('invoice_events')
    .select('*')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`[db] getInvoiceEvents: ${error.message}`)
  return (data ?? []) as InvoiceEvent[]
}
