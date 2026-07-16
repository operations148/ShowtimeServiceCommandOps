// ─── Status enum ─────────────────────────────────────────────────────────────
// Phase 6 consolidated this from the old 5-state model (draft/deposit_due/
// deposit_paid/paid/void) into the full billing lifecycle. DEPOSIT_PAID is
// retained as a LEGACY value for pre-existing rows — new code never sets it;
// the transitions table gives it a bridge out into the consolidated states.

export enum InvoiceStatus {
  DRAFT          = 'draft',
  READY          = 'ready',
  SENT           = 'sent',
  VIEWED         = 'viewed',
  DEPOSIT_DUE    = 'deposit_due',
  /** LEGACY (pre-Phase-6 rows only). New payments land as PARTIALLY_PAID/PAID. */
  DEPOSIT_PAID   = 'deposit_paid',
  PARTIALLY_PAID = 'partially_paid',
  PAID           = 'paid',
  OVERDUE        = 'overdue',
  VOID           = 'void',
  REFUNDED       = 'refunded',
  CREDITED       = 'credited',
}

/**
 * Authoritative state machine for invoice status transitions (Phase 6).
 * Import and use this everywhere — never hardcode allowed transitions.
 * Helper predicates live in src/lib/invoices/state-machine.ts.
 *
 * Delivery flow:  draft ⇄ ready → sent → viewed
 * Payment flow:   sent/viewed → deposit_due → partially_paid → paid
 * Aging:          any open status → overdue (cron/read-time), payment still lands
 * Endings:        void (unpaid), refunded (paid → money returned),
 *                 credited (balance zeroed by credit note) — all terminal
 */
export const INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  [InvoiceStatus.DRAFT]:          [InvoiceStatus.READY, InvoiceStatus.SENT, InvoiceStatus.VOID],
  [InvoiceStatus.READY]:          [InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.VOID],
  [InvoiceStatus.SENT]:           [InvoiceStatus.VIEWED, InvoiceStatus.DEPOSIT_DUE, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.VOID],
  [InvoiceStatus.VIEWED]:         [InvoiceStatus.DEPOSIT_DUE, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.VOID],
  [InvoiceStatus.DEPOSIT_DUE]:    [InvoiceStatus.VIEWED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.VOID],
  // Legacy bridge: pre-Phase-6 rows exit into the consolidated states.
  [InvoiceStatus.DEPOSIT_PAID]:   [InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.VOID],
  [InvoiceStatus.PARTIALLY_PAID]: [InvoiceStatus.PAID, InvoiceStatus.OVERDUE, InvoiceStatus.REFUNDED, InvoiceStatus.CREDITED, InvoiceStatus.VOID],
  [InvoiceStatus.OVERDUE]:        [InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.PAID, InvoiceStatus.CREDITED, InvoiceStatus.VOID],
  // A paid invoice is never voided — money moved; refund/credit are the paths.
  [InvoiceStatus.PAID]:           [InvoiceStatus.REFUNDED, InvoiceStatus.CREDITED, InvoiceStatus.PARTIALLY_PAID],
  [InvoiceStatus.VOID]:           [],
  [InvoiceStatus.REFUNDED]:       [],
  [InvoiceStatus.CREDITED]:       [],
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

  /** DEPRECATED plaintext token (pre-Phase-6 rows). No Phase 6 code reads it. */
  public_token: string

  // ── Phase 6 hardening ───────────────────────────────────────────────────────
  /** SHA-256 hash of the 256-bit public token (ADR-0007); plaintext never stored. */
  public_token_hash?: string | null
  token_expires_at?: string | null
  token_revoked_at?: string | null
  /** Optimistic-concurrency token. */
  version: number

  // Source links + immutable creation-time snapshot of the source document
  source_change_order_id?: string | null
  source_snapshot?: Record<string, unknown> | null
  invoice_kind: InvoiceKind
  milestone_label?: string | null

  // Void / refund / credit metadata (financial records are never hard-deleted)
  voided_at?: string | null
  voided_by?: string | null
  void_reason?: string | null
  refunded_at?: string | null
  amount_refunded: number   // cents
  credited_amount: number   // cents
  credit_reason?: string | null

  created_by?: string | null
  created_at: string
  updated_at: string

  // Joined — populated only when explicitly requested
  line_items?: InvoiceLineItem[]
}

export type InvoiceKind = 'standard' | 'deposit' | 'milestone' | 'final'

// ─── Payment ledger (Phase 6, ADR-0012) ─────────────────────────────────────
// Append-only money-movement facts. Rows are never mutated after insert
// (except reconciliation_* stamps); corrections append offsetting rows.

export type PaymentKind = 'payment' | 'refund' | 'credit'
export type PaymentProvider = 'stripe' | 'manual'
export type PaymentStatus = 'pending' | 'succeeded' | 'failed'
export type PaymentEventSource = 'webhook' | 'manual' | 'reconciliation'
export type ReconciliationStatus = 'unreconciled' | 'reconciled' | 'mismatch'

export interface Payment {
  id: string
  tenant_id: string
  invoice_id: string
  payment_number: string   // PAY-XXXX
  kind: PaymentKind
  /** Always positive cents; `kind` carries direction. */
  amount: number
  currency: string
  provider: PaymentProvider
  provider_account_id?: string | null
  provider_payment_intent_id?: string | null
  provider_checkout_session_id?: string | null
  provider_charge_id?: string | null
  provider_refund_id?: string | null
  status: PaymentStatus
  failure_code?: string | null
  failure_message?: string | null
  refunded_payment_id?: string | null
  idempotency_key?: string | null
  event_source: PaymentEventSource
  reconciliation_status: ReconciliationStatus
  reconciled_at?: string | null
  metadata?: Record<string, unknown> | null
  created_by?: string | null
  created_at: string
}

// ─── Invoice events (append-only activity/audit log) ────────────────────────

export type InvoiceEventType =
  | 'created'
  | 'updated'
  | 'sent'
  | 'send_failed'
  | 'viewed'
  | 'payment_recorded'
  | 'payment_failed'
  | 'refund_recorded'
  | 'credit_recorded'
  | 'voided'
  | 'token_revoked'
  | 'overdue_marked'
  | 'reconciliation_flagged'
  | 'reconciliation_resolved'

export interface InvoiceEvent {
  id: string
  invoice_id: string
  tenant_id: string
  event_type: InvoiceEventType
  actor_user_id?: string | null
  actor_name?: string | null
  ip?: string | null
  user_agent?: string | null
  recipient_email?: string | null
  preview_mode?: boolean | null
  test_override?: boolean | null
  provider_message_id?: string | null
  error_detail?: string | null
  payment_id?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

// ─── Reconciliation (Phase 6) ────────────────────────────────────────────────

export type ReconciliationFindingType =
  | 'missing_ledger_entry'
  | 'amount_mismatch'
  | 'account_mismatch'
  | 'status_mismatch'
  | 'orphaned_payment'

export interface ReconciliationRun {
  id: string
  triggered_by: 'cron' | 'manual'
  triggered_user_id?: string | null
  status: 'running' | 'completed' | 'failed'
  invoices_checked: number
  payments_checked: number
  findings_count: number
  error_detail?: string | null
  started_at: string
  finished_at?: string | null
}

export interface ReconciliationFinding {
  id: string
  run_id: string
  tenant_id: string
  invoice_id?: string | null
  payment_id?: string | null
  finding_type: ReconciliationFindingType
  detail?: Record<string, unknown> | null
  status: 'open' | 'resolved' | 'ignored'
  resolved_by?: string | null
  resolved_at?: string | null
  resolution_reason?: string | null
  created_at: string
}

// ─── Public (customer-facing) shapes — the ONLY fields safe to expose ────────

export interface PublicInvoiceLineItem {
  id: string
  description: string
  details?: string | null
  quantity: number
  unit_price: number // cents
  total: number      // cents
  // NO unit_cost or pricebook pointers
}

export interface PublicPaymentSummary {
  kind: PaymentKind
  amount: number // cents
  created_at: string
  // NO provider ids, tenant ids, or internal metadata
}

export interface PublicInvoice {
  invoice_number: string
  title: string
  status: InvoiceStatus
  invoice_kind: InvoiceKind
  milestone_label?: string | null

  customer_name: string
  issue_date: string
  due_date?: string | null

  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total: number
  amount_paid: number
  amount_due: number
  amount_refunded: number

  deposit_required: boolean
  deposit_amount: number
  /** Whether the deposit has been satisfied by ledger payments. */
  deposit_paid: boolean

  notes?: string | null
  terms?: string | null
  payment_instructions?: string | null

  line_items: PublicInvoiceLineItem[]
  payments: PublicPaymentSummary[]

  company_name: string
  company_logo_url?: string | null
  company_phone?: string | null
  company_email?: string | null

  paid_at?: string | null
  is_expired: boolean
  /** Whether the tenant can accept card payment right now (Stripe onboarded). */
  can_pay_online: boolean
  // NO tenant_id, NO internal notes, NO costs, NO staff/provider ids
}
