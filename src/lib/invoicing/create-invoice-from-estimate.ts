import { db } from '@/lib/db/client'
import { getInvoiceByEstimateHandoffId } from '@/lib/db/queries/invoices'
import { nextDocumentNumber } from '@/lib/db/queries/document-numbers'
import { depositAmount } from '@/lib/money/money'
import { Invoice, InvoiceStatus } from '@/types/invoice'

// ─── Result union ─────────────────────────────────────────────────────────────

export type CreateInvoiceFromEstimateResult =
  | { outcome: 'created';        invoice: Invoice }
  | { outcome: 'already_exists'; invoice: Invoice }
  | { outcome: 'error';          reason: string }

// ─── Options ──────────────────────────────────────────────────────────────────

export interface LineItemInput {
  sort_order: number
  description: string
  details?: string
  quantity: number
  unit_price: number  // cents
  total: number       // cents
}

export interface CreateInvoiceFromEstimateOpts {
  // Customer snapshot — denormalised at invoice creation time so the invoice
  // never drifts when the property or GHL contact is later edited.
  customer_name: string
  customer_email?: string
  customer_phone?: string
  customer_address?: string

  // Financial snapshot from the locked estimate — all values in integer cents.
  total_cents: number
  subtotal_cents?: number         // defaults to total_cents if omitted
  tax_rate?: number               // decimal, e.g. 0.0875; default 0
  tax_amount_cents?: number       // default 0
  discount_amount_cents?: number  // default 0

  // Optional line-item snapshot. When provided, rows are inserted into
  // invoice_line_items so the breakdown is preserved alongside the totals.
  line_items?: LineItemInput[]

  // Metadata
  title?: string
  work_order_id?: string
  property_id?: string
  ghl_opportunity_id?: string
  notes?: string
  terms?: string
  payment_instructions?: string
  issue_date?: string  // YYYY-MM-DD; defaults to today
  due_date?: string    // YYYY-MM-DD
  created_by?: string  // user UUID
}

// ─── Private row shape (mirrors invoices table) ───────────────────────────────

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
  created_by: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: InvoiceRow): Invoice {
  return {
    id:                         row.id,
    tenant_id:                  row.tenant_id,
    estimate_handoff_id:        row.estimate_handoff_id  ?? undefined,
    estimate_id:                row.estimate_id          ?? undefined,
    work_order_id:              row.work_order_id        ?? undefined,
    property_id:                row.property_id          ?? undefined,
    ghl_contact_id:             row.ghl_contact_id       ?? undefined,
    ghl_opportunity_id:         row.ghl_opportunity_id   ?? undefined,
    invoice_number:             row.invoice_number,
    title:                      row.title,
    status:                     row.status as InvoiceStatus,
    customer_name:              row.customer_name,
    customer_email:             row.customer_email    ?? undefined,
    customer_phone:             row.customer_phone    ?? undefined,
    customer_address:           row.customer_address  ?? undefined,
    issue_date:                 row.issue_date,
    due_date:                   row.due_date          ?? undefined,
    sent_at:                    row.sent_at           ?? undefined,
    viewed_at:                  row.viewed_at         ?? undefined,
    paid_at:                    row.paid_at           ?? undefined,
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
    notes:                      row.notes                      ?? undefined,
    terms:                      row.terms                      ?? undefined,
    payment_instructions:       row.payment_instructions       ?? undefined,
    stripe_payment_intent_id:   row.stripe_payment_intent_id   ?? undefined,
    stripe_payment_link:        row.stripe_payment_link        ?? undefined,
    stripe_checkout_session_id: row.stripe_checkout_session_id ?? undefined,
    public_token:               row.public_token,
    created_by:                 row.created_by ?? undefined,
    created_at:                 row.created_at,
    updated_at:                 row.updated_at,
  }
}

// ─── createInvoiceFromEstimate ────────────────────────────────────────────────
// Pure-ish: reads from DB then writes. Never throws — all failures surface as
// { outcome: 'error', reason }.
//
// Idempotency is guaranteed by two independent guards:
//   1. Explicit pre-check via getInvoiceByEstimateHandoffId (handles the common path).
//   2. UNIQUE(estimate_handoff_id) DB constraint catches races and re-fetches.

export async function createInvoiceFromEstimate(
  estimateHandoffId: string,
  tenantId: string,
  opts: CreateInvoiceFromEstimateOpts,
): Promise<CreateInvoiceFromEstimateResult> {
  try {
    // ── 1. Idempotency: return existing invoice without creating a second ──
    const existing = await getInvoiceByEstimateHandoffId(estimateHandoffId, tenantId)
    if (existing) {
      return { outcome: 'already_exists', invoice: existing }
    }

    // ── 2. Compute deposit (10 % floor, rounded to nearest cent) ─────────
    const depositPercent      = 10
    const depositAmountCents  = depositAmount(opts.total_cents, depositPercent)
    const subtotal            = opts.subtotal_cents        ?? opts.total_cents
    const taxRate             = opts.tax_rate              ?? 0
    const taxAmount           = opts.tax_amount_cents      ?? 0
    const discountAmount      = opts.discount_amount_cents ?? 0

    // ── 3. Tenant-scoped, transaction-safe invoice number (Phase 2) ──────
    const invoiceNumber = await nextDocumentNumber(tenantId, 'invoice')

    // ── 4. Insert — status = deposit_due, snapshot the locked estimate ───
    const now = new Date().toISOString()
    const { data, error } = await db
      .from('invoices')
      .insert({
        tenant_id:            tenantId,
        estimate_handoff_id:  estimateHandoffId,
        invoice_number:       invoiceNumber,
        title:                opts.title ?? 'Service Invoice',
        status:               InvoiceStatus.DEPOSIT_DUE,
        customer_name:        opts.customer_name,
        customer_email:       opts.customer_email        ?? null,
        customer_phone:       opts.customer_phone        ?? null,
        customer_address:     opts.customer_address      ?? null,
        issue_date:           opts.issue_date             ?? now.slice(0, 10),
        due_date:             opts.due_date               ?? null,
        subtotal,
        tax_rate:             taxRate,
        tax_amount:           taxAmount,
        discount_amount:      discountAmount,
        total:                opts.total_cents,
        amount_paid:          0,
        amount_due:           opts.total_cents,
        deposit_percent:      depositPercent,
        deposit_amount:       depositAmountCents,
        deposit_required:     true,
        sent_at:              now,  // deposit_due → invoice is live to the customer
        notes:                opts.notes                 ?? null,
        terms:                opts.terms                 ?? null,
        payment_instructions: opts.payment_instructions  ?? null,
        work_order_id:        opts.work_order_id         ?? null,
        property_id:          opts.property_id           ?? null,
        ghl_opportunity_id:   opts.ghl_opportunity_id    ?? null,
        created_by:           opts.created_by            ?? null,
      })
      .select('*')
      .single()

    if (error) {
      // Race condition: UNIQUE(estimate_handoff_id) caught a concurrent insert.
      // Re-fetch the winner and return already_exists so callers stay idempotent.
      if (error.code === '23505') {
        const race = await getInvoiceByEstimateHandoffId(estimateHandoffId, tenantId)
        if (race) return { outcome: 'already_exists', invoice: race }
      }
      return { outcome: 'error', reason: error.message }
    }

    const invoice = mapRow(data as unknown as InvoiceRow)

    // ── 5. Snapshot line items if the caller provided them ────────────────
    if (opts.line_items && opts.line_items.length > 0) {
      const lineItemRows = opts.line_items.map((li) => ({
        invoice_id:  invoice.id,
        tenant_id:   tenantId,
        sort_order:  li.sort_order,
        description: li.description,
        details:     li.details ?? null,
        quantity:    li.quantity,
        unit_price:  li.unit_price,
        total:       li.total,
      }))

      const { error: liError } = await db
        .from('invoice_line_items')
        .insert(lineItemRows)

      if (liError) {
        // Line items are supplementary; log but do not fail the whole operation.
        console.error(`[invoicing] line_items insert failed for invoice ${invoice.id}: ${liError.message}`)
      }
    }

    return { outcome: 'created', invoice }
  } catch (err) {
    return {
      outcome: 'error',
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}
