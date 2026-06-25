import { db } from '@/lib/db/client'
import { Invoice, InvoiceStatus, INVOICE_STATUS_TRANSITIONS } from '@/types/invoice'
import type { CreateInvoiceInput, PatchInvoiceInput } from '@/lib/validation/invoice'

// ─── Raw DB row ────────────────────────────────────────────────────────────────

type InvoiceRow = {
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
  status: string                // DB enum returns as string
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
  tax_rate: number | string     // Postgres NUMERIC can arrive as string
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
  created_by: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: InvoiceRow): Invoice {
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
    created_by:                 row.created_by ?? undefined,
    created_at:                 row.created_at,
    updated_at:                 row.updated_at,
  }
}

// ─── Result types ──────────────────────────────────────────────────────────────

export type InvoiceResult =
  | { ok: true; data: Invoice }
  | { ok: false; notFound: true }

export type InvoiceStatusResult =
  | { ok: true; data: Invoice }
  | { ok: false; notFound: true }
  | { ok: false; invalidTransition: true; from: InvoiceStatus; allowed: InvoiceStatus[] }

// ─── List filters ──────────────────────────────────────────────────────────────

export interface InvoiceListFilters {
  status?: InvoiceStatus
  work_order_id?: string
  estimate_handoff_id?: string
}

// ─── createInvoice ─────────────────────────────────────────────────────────────

export async function createInvoice(
  input: CreateInvoiceInput,
  tenantId: string,
): Promise<Invoice> {
  // Generate sequential invoice number — tenant-scoped, optimistic (race-safe
  // enough for low-volume ops; replace with a DB sequence when needed)
  const { count, error: countError } = await db
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  if (countError) throw new Error(`[db] createInvoice count: ${countError.message}`)

  const invoiceNumber = `INV-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { data, error } = await db
    .from('invoices')
    .insert({
      tenant_id:            tenantId,
      invoice_number:       invoiceNumber,
      title:                input.title,
      status:               InvoiceStatus.DRAFT,
      customer_name:        input.customer_name,
      customer_email:       input.customer_email ?? null,
      customer_phone:       input.customer_phone ?? null,
      customer_address:     input.customer_address ?? null,
      issue_date:           input.issue_date ?? new Date().toISOString().slice(0, 10),
      due_date:             input.due_date ?? null,
      subtotal:             input.subtotal,
      tax_rate:             input.tax_rate,
      tax_amount:           input.tax_amount,
      discount_amount:      input.discount_amount,
      total:                input.total,
      amount_paid:          0,
      amount_due:           input.total,
      deposit_percent:      input.deposit_percent,
      deposit_amount:       input.deposit_amount,
      deposit_required:     input.deposit_required,
      notes:                input.notes ?? null,
      terms:                input.terms ?? null,
      payment_instructions: input.payment_instructions ?? null,
      estimate_handoff_id:  input.estimate_handoff_id ?? null,
      work_order_id:        input.work_order_id ?? null,
      property_id:          input.property_id ?? null,
      ghl_opportunity_id:   input.ghl_opportunity_id ?? null,
    })
    .select('*')
    .single()

  if (error) throw new Error(`[db] createInvoice: ${error.message}`)

  return mapRow(data as unknown as InvoiceRow)
}

// ─── getInvoiceById ────────────────────────────────────────────────────────────

export async function getInvoiceById(
  id: string,
  tenantId: string,
): Promise<Invoice | undefined> {
  const { data, error } = await db
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw new Error(`[db] getInvoiceById: ${error.message}`)
  if (!data) return undefined

  return mapRow(data as unknown as InvoiceRow)
}

// ─── getInvoiceByEstimateHandoffId ─────────────────────────────────────────────
// Primary Phase-15 lookup: find the invoice created from a customer-accepted
// estimate handoff. Returns undefined if no invoice has been created yet.

export async function getInvoiceByEstimateHandoffId(
  estimateHandoffId: string,
  tenantId: string,
): Promise<Invoice | undefined> {
  const { data, error } = await db
    .from('invoices')
    .select('*')
    .eq('estimate_handoff_id', estimateHandoffId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) throw new Error(`[db] getInvoiceByEstimateHandoffId: ${error.message}`)
  if (!data) return undefined

  return mapRow(data as unknown as InvoiceRow)
}

// ─── listInvoices ──────────────────────────────────────────────────────────────

export async function listInvoices(
  tenantId: string,
  filters: InvoiceListFilters = {},
): Promise<Invoice[]> {
  let query = db
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (filters.status !== undefined) {
    query = query.eq('status', filters.status)
  }
  if (filters.work_order_id !== undefined) {
    query = query.eq('work_order_id', filters.work_order_id)
  }
  if (filters.estimate_handoff_id !== undefined) {
    query = query.eq('estimate_handoff_id', filters.estimate_handoff_id)
  }

  const { data, error } = await query
  if (error) throw new Error(`[db] listInvoices: ${error.message}`)

  return ((data ?? []) as unknown as InvoiceRow[]).map(mapRow)
}

// ─── updateInvoiceStatus ───────────────────────────────────────────────────────
// Validates the transition against INVOICE_STATUS_TRANSITIONS before writing.
// Sets lifecycle timestamps (sent_at, paid_at) automatically.

export async function updateInvoiceStatus(
  invoiceId: string,
  newStatus: InvoiceStatus,
  tenantId: string,
): Promise<InvoiceStatusResult> {
  const { data: existing, error: fetchError } = await db
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchError) throw new Error(`[db] updateInvoiceStatus fetch: ${fetchError.message}`)
  if (!existing) return { ok: false, notFound: true }

  const row = existing as unknown as InvoiceRow
  const currentStatus = row.status as InvoiceStatus
  const allowed = INVOICE_STATUS_TRANSITIONS[currentStatus]

  if (!allowed.includes(newStatus)) {
    return { ok: false, invalidTransition: true, from: currentStatus, allowed }
  }

  // Derive lifecycle timestamps from the target status
  const now = new Date().toISOString()
  const timestampPatch: Record<string, string | null> = {}
  if (newStatus === InvoiceStatus.DEPOSIT_DUE && !row.sent_at) {
    timestampPatch.sent_at = now
  }
  if (newStatus === InvoiceStatus.PAID && !row.paid_at) {
    timestampPatch.paid_at = now
  }

  const { data, error } = await db
    .from('invoices')
    .update({ status: newStatus, ...timestampPatch })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) throw new Error(`[db] updateInvoiceStatus update: ${error.message}`)

  return { ok: true, data: mapRow(data as unknown as InvoiceRow) }
}

// ─── markDepositPaid ───────────────────────────────────────────────────────────
// Idempotent: if the invoice already has this stripe_payment_intent_id recorded
// and is in deposit_paid status, returns the current row without writing again.

export async function markDepositPaid(
  invoiceId: string,
  stripePaymentIntentId: string,
  tenantId: string,
): Promise<InvoiceStatusResult> {
  const { data: existing, error: fetchError } = await db
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchError) throw new Error(`[db] markDepositPaid fetch: ${fetchError.message}`)
  if (!existing) return { ok: false, notFound: true }

  const row = existing as unknown as InvoiceRow
  const currentStatus = row.status as InvoiceStatus

  // Idempotency: already processed this payment intent
  if (
    currentStatus === InvoiceStatus.DEPOSIT_PAID &&
    row.stripe_payment_intent_id === stripePaymentIntentId
  ) {
    return { ok: true, data: mapRow(row) }
  }

  const allowed = INVOICE_STATUS_TRANSITIONS[currentStatus]
  if (!allowed.includes(InvoiceStatus.DEPOSIT_PAID)) {
    return {
      ok: false,
      invalidTransition: true,
      from: currentStatus,
      allowed,
    }
  }

  const { data, error } = await db
    .from('invoices')
    .update({
      status:                   InvoiceStatus.DEPOSIT_PAID,
      amount_paid:              row.deposit_amount,
      amount_due:               row.total - row.deposit_amount,
      stripe_payment_intent_id: stripePaymentIntentId,
    })
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) throw new Error(`[db] markDepositPaid update: ${error.message}`)

  return { ok: true, data: mapRow(data as unknown as InvoiceRow) }
}

// ─── patchInvoice ──────────────────────────────────────────────────────────────
// General-purpose update for non-status fields (e.g. Stripe links, notes).
// Use updateInvoiceStatus for status changes to enforce the state machine.

export async function patchInvoice(
  invoiceId: string,
  patch: PatchInvoiceInput,
  tenantId: string,
): Promise<InvoiceResult> {
  const { data: existing, error: fetchError } = await db
    .from('invoices')
    .select('id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (fetchError) throw new Error(`[db] patchInvoice fetch: ${fetchError.message}`)
  if (!existing) return { ok: false, notFound: true }

  // Strip undefined — only send fields that were explicitly provided
  const updatePayload: Record<string, unknown> = {}
  const allowed: Array<keyof PatchInvoiceInput> = [
    'title', 'customer_email', 'customer_phone', 'customer_address',
    'due_date', 'sent_at', 'viewed_at', 'paid_at',
    'subtotal', 'tax_rate', 'tax_amount', 'discount_amount', 'total',
    'amount_paid', 'deposit_percent', 'deposit_amount', 'deposit_required',
    'notes', 'terms', 'payment_instructions',
    'stripe_payment_intent_id', 'stripe_payment_link', 'stripe_checkout_session_id',
  ]
  for (const key of allowed) {
    const val = patch[key]
    if (val !== undefined) updatePayload[key] = val
  }

  const { data, error } = await db
    .from('invoices')
    .update(updatePayload)
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .select('*')
    .single()

  if (error) throw new Error(`[db] patchInvoice update: ${error.message}`)

  return { ok: true, data: mapRow(data as unknown as InvoiceRow) }
}
