import type { Invoice } from '@/types/invoice'
import { ChangeOrderStatus } from '@/types/change-order'
import { getWorkOrderById } from '@/lib/db/queries/work-orders'
import { getChangeOrderById } from '@/lib/db/queries/change-orders'
import { createInvoiceDocument, recordInvoiceEvent } from '@/lib/db/queries/invoices'
import type { CreateInvoiceInput, InvoiceLineInput } from '@/lib/validation/invoice'

/**
 * Invoice creation from source documents (Phase 6). Estimate acceptance
 * already materialises its own draft invoice (Phase 3's convertEstimateToInvoice,
 * idempotent via UNIQUE(invoices.estimate_id)) — these cover the remaining
 * required sources: work orders (standard/milestone/final billing) and
 * ACCEPTED change orders. Every path stamps an immutable source_snapshot of
 * the source document as it stood at creation time.
 */

export type CreateFromSourceResult =
  | { ok: true; invoice: Invoice }
  | { ok: false; reason: 'source_not_found' | 'change_order_not_accepted'; detail?: string }

export interface CreateFromWorkOrderOpts {
  kind: 'standard' | 'milestone' | 'final'
  milestoneLabel?: string
  lineItems: InvoiceLineInput[]
  taxRate?: number
  discountCents?: number
  depositRequired?: boolean
  depositPercent?: number
  dueDate?: string
  notes?: string
  terms?: string
  paymentInstructions?: string
}

export async function createInvoiceFromWorkOrder(
  workOrderId: string,
  tenantId: string,
  userId: string,
  opts: CreateFromWorkOrderOpts,
): Promise<CreateFromSourceResult> {
  const wo = await getWorkOrderById(workOrderId, tenantId)
  if (!wo) return { ok: false, reason: 'source_not_found' }

  const input: CreateInvoiceInput = {
    title: opts.kind === 'final' ? `Final Invoice — ${wo.title}` : wo.title,
    invoice_kind: opts.kind,
    milestone_label: opts.milestoneLabel,
    customer_name: wo.property_customer_name || 'Customer',
    customer_email: undefined,
    customer_phone: undefined,
    customer_address: wo.property_address || undefined,
    issue_date: undefined,
    due_date: opts.dueDate,
    tax_rate: opts.taxRate ?? 0,
    discount_amount: opts.discountCents ?? 0,
    deposit_required: opts.depositRequired ?? false,
    deposit_percent: opts.depositPercent ?? 10,
    notes: opts.notes,
    terms: opts.terms,
    payment_instructions: opts.paymentInstructions,
    work_order_id: workOrderId,
    property_id: wo.property_id ?? undefined,
    ghl_opportunity_id: wo.ghl_opportunity_id ?? undefined,
    line_items: opts.lineItems,
  }

  const invoice = await createInvoiceDocument(input, tenantId, userId, {
    source_snapshot: {
      source_type: 'work_order',
      work_order_id: wo.id,
      wo_number: wo.wo_number,
      title: wo.title,
      status: wo.status,
      service_category: wo.service_category,
      approved_contract_amount_cents: wo.approved_contract_amount_cents,
      captured_at: new Date().toISOString(),
    },
  })

  await recordInvoiceEvent({
    invoiceId: invoice.id,
    tenantId,
    eventType: 'created',
    actorUserId: userId,
    metadata: { source: 'work_order', work_order_id: workOrderId, kind: opts.kind },
  })

  return { ok: true, invoice }
}

/**
 * An approved change order bills its accepted price impact. Only ACCEPTED
 * change orders may be invoiced — a pending or rejected CO has no approved
 * amount to bill.
 */
export async function createInvoiceFromChangeOrder(
  changeOrderId: string,
  tenantId: string,
  userId: string,
  opts: { dueDate?: string; notes?: string; terms?: string } = {},
): Promise<CreateFromSourceResult> {
  const co = await getChangeOrderById(changeOrderId, tenantId, { withLines: true })
  if (!co) return { ok: false, reason: 'source_not_found' }
  if (co.status !== ChangeOrderStatus.ACCEPTED) {
    return { ok: false, reason: 'change_order_not_accepted', detail: `status is '${co.status}'` }
  }

  const lineItems: InvoiceLineInput[] = (co.line_items ?? []).map((l) => ({
    description: l.name,
    details: l.description ?? undefined,
    quantity: l.quantity,
    unit_price: l.unit_price,
  }))
  if (lineItems.length === 0) {
    // A change order can carry a bare price impact with no itemised lines.
    lineItems.push({
      description: `Change order ${co.change_order_number} — ${co.reason}`,
      details: undefined,
      quantity: 1,
      unit_price: co.price_impact_cents,
    })
  }

  const input: CreateInvoiceInput = {
    title: `Change Order ${co.change_order_number}`,
    invoice_kind: 'standard',
    milestone_label: undefined,
    customer_name: co.customer_name,
    customer_email: co.customer_email ?? undefined,
    customer_phone: undefined,
    customer_address: undefined,
    issue_date: undefined,
    due_date: opts.dueDate,
    tax_rate: co.tax_rate,
    discount_amount: 0,
    deposit_required: false,
    deposit_percent: 10,
    notes: opts.notes,
    terms: opts.terms,
    payment_instructions: undefined,
    work_order_id: co.work_order_id,
    property_id: undefined,
    ghl_opportunity_id: undefined,
    line_items: lineItems,
  }

  const invoice = await createInvoiceDocument(input, tenantId, userId, {
    source_change_order_id: changeOrderId,
    source_snapshot: {
      source_type: 'change_order',
      change_order_id: co.id,
      change_order_number: co.change_order_number,
      reason: co.reason,
      accepted_at: co.accepted_at,
      accepted_by_name: co.accepted_by_name,
      price_impact_cents: co.price_impact_cents,
      tax_impact_cents: co.tax_impact_cents,
      total_impact_cents: co.total_impact_cents,
      captured_at: new Date().toISOString(),
    },
  })

  await recordInvoiceEvent({
    invoiceId: invoice.id,
    tenantId,
    eventType: 'created',
    actorUserId: userId,
    metadata: { source: 'change_order', change_order_id: changeOrderId },
  })

  return { ok: true, invoice }
}
