// ─── Status enum ─────────────────────────────────────────────────────────────

export enum InvoiceStatus {
  DRAFT        = 'draft',
  DEPOSIT_DUE  = 'deposit_due',
  DEPOSIT_PAID = 'deposit_paid',
  PAID         = 'paid',
  VOID         = 'void',
}

/**
 * Authoritative state machine for invoice status transitions.
 * Import and use this everywhere — never hardcode allowed transitions.
 *
 * draft        → deposit_due | void
 * deposit_due  → deposit_paid | void
 * deposit_paid → paid | void
 * paid         → void   (refund path)
 * void         → []     (terminal)
 */
export const INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  [InvoiceStatus.DRAFT]:        [InvoiceStatus.DEPOSIT_DUE, InvoiceStatus.VOID],
  [InvoiceStatus.DEPOSIT_DUE]:  [InvoiceStatus.DEPOSIT_PAID, InvoiceStatus.VOID],
  [InvoiceStatus.DEPOSIT_PAID]: [InvoiceStatus.PAID, InvoiceStatus.VOID],
  [InvoiceStatus.PAID]:         [InvoiceStatus.VOID],
  [InvoiceStatus.VOID]:         [],
}

// ─── InvoiceLineItem ─────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  id: string
  invoice_id: string
  tenant_id: string
  sort_order: number
  description: string
  details?: string | null
  quantity: number
  unit_price: number  // cents
  total: number       // cents
  created_at: string
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export interface Invoice {
  id: string
  tenant_id: string

  // FK references — all optional
  estimate_handoff_id?: string | null   // primary Phase-15 link
  estimate_id?: string | null           // FK to estimates table (future)
  work_order_id?: string | null
  property_id?: string | null
  ghl_contact_id?: string | null
  ghl_opportunity_id?: string | null

  // Identity
  invoice_number: string   // e.g. "INV-0001", generated server-side
  title: string
  status: InvoiceStatus

  // Customer snapshot (denormalised from property / GHL contact at invoice time)
  customer_name: string
  customer_email?: string | null
  customer_phone?: string | null
  customer_address?: string | null

  // Dates
  issue_date: string
  due_date?: string | null
  sent_at?: string | null
  viewed_at?: string | null
  paid_at?: string | null

  // Money — all values in integer cents
  subtotal: number         // sum of line items before tax/discount
  tax_rate: number         // decimal, e.g. 0.0875 for 8.75 %
  tax_amount: number       // cents
  discount_amount: number  // cents
  total: number            // subtotal + tax_amount − discount_amount
  amount_paid: number      // cents collected so far
  amount_due: number       // total − amount_paid

  // Deposit (mandatory 10 % minimum per spec)
  deposit_percent: number   // e.g. 10 for 10 %
  deposit_amount: number    // cents — computed: round(total * deposit_percent / 100)
  deposit_required: boolean

  // Content
  notes?: string | null
  terms?: string | null
  payment_instructions?: string | null

  // Stripe
  stripe_payment_intent_id?: string | null
  stripe_payment_link?: string | null
  stripe_checkout_session_id?: string | null

  // Public customer-facing URL token
  public_token: string

  created_by?: string | null
  created_at: string
  updated_at: string

  // Joined — populated only when explicitly requested
  line_items?: InvoiceLineItem[]
}
