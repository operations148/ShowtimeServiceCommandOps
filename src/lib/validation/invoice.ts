import { z } from 'zod'
import { InvoiceStatus } from '@/types/invoice'

// ─── Helpers (same conventions as validation/estimate.ts / change-order.ts) ──

function optStr(maxLen = 5000) {
  return z
    .string()
    .max(maxLen)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v))
}

function optUUID() {
  return z
    .string()
    .uuid('Invalid UUID')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v))
}

function optDate() {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (expected YYYY-MM-DD)')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v))
}

const cents = (label: string) =>
  z.number().int(`${label} must be whole cents`).min(0, `${label} must be >= 0`).max(1_000_000_000)

const versionToken = z.number().int().min(1, 'version must be >= 1')

// ─── Line item input ──────────────────────────────────────────────────────────
// NOTE: no client-sent total — totals are always server-computed (Phase 6
// "server-owned totals"; a forged client amount is structurally impossible).

export const InvoiceLineInputSchema = z.object({
  description: z.string().min(1, 'Description is required').max(300).transform((v) => v.trim()),
  details: optStr(2000),
  quantity: z.number().min(0, 'Quantity must be >= 0').max(1_000_000).default(1),
  unit_price: cents('Unit price'),
})
export type InvoiceLineInput = z.infer<typeof InvoiceLineInputSchema>

// ─── Create ───────────────────────────────────────────────────────────────────
// Manual authorized entry + the programmatic source paths (work order /
// change order) share this schema; source links are attached server-side.

export const CreateInvoiceSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200).transform((v) => v.trim()),
  invoice_kind: z.enum(['standard', 'deposit', 'milestone', 'final']).default('standard'),
  milestone_label: optStr(200),

  customer_name: z.string().min(1, 'Customer name is required').max(200).transform((v) => v.trim()),
  customer_email: z.string().email('Invalid email').optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  customer_phone: optStr(30),
  customer_address: optStr(500),

  issue_date: optDate(),
  due_date: optDate(),

  tax_rate: z.number().min(0, 'Tax rate must be >= 0').max(1, 'Tax rate must be <= 1').default(0),
  discount_amount: cents('Discount').default(0),

  deposit_required: z.boolean().default(false),
  deposit_percent: z.number().min(10, 'Deposit must be at least 10 %').max(100).default(10),

  notes: optStr(5000),
  terms: optStr(5000),
  payment_instructions: optStr(2000),

  work_order_id: optUUID(),
  property_id: optUUID(),
  ghl_opportunity_id: optStr(100),

  line_items: z.array(InvoiceLineInputSchema).min(1, 'At least one line item is required').max(200),
})
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>

// ─── Patch (draft/ready only — enforced server-side; version-gated) ──────────

export const PatchInvoiceSchema = z.object({
  version: versionToken,

  title: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  milestone_label: optStr(200),

  customer_name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  customer_email: z.string().email('Invalid email').optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  customer_phone: optStr(30),
  customer_address: optStr(500),

  issue_date: optDate(),
  due_date: optDate(),

  tax_rate: z.number().min(0).max(1).optional(),
  discount_amount: cents('Discount').optional(),

  deposit_required: z.boolean().optional(),
  deposit_percent: z.number().min(10).max(100).optional(),

  notes: optStr(5000),
  terms: optStr(5000),
  payment_instructions: optStr(2000),

  line_items: z.array(InvoiceLineInputSchema).min(1).max(200).optional(),
})
export type PatchInvoiceInput = z.infer<typeof PatchInvoiceSchema>

// ─── Lifecycle actions ────────────────────────────────────────────────────────

export const InvoiceTransitionSchema = z.object({
  version: versionToken,
  to: z.enum(['draft', 'ready']),
})
export type InvoiceTransitionInput = z.infer<typeof InvoiceTransitionSchema>

export const VoidInvoiceSchema = z.object({
  version: versionToken,
  reason: z.string().min(5, 'A reason of at least 5 characters is required').max(1000).transform((v) => v.trim()),
})
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceSchema>

export const InvoiceSendSchema = z.object({
  version: versionToken,
  recipient_email: z.string().email('Invalid recipient email').optional(),
  expires_in_days: z.number().int().min(1).max(365).default(60),
})
export type InvoiceSendInput = z.infer<typeof InvoiceSendSchema>

// ─── Ledger actions (manual payment / refund / credit) ───────────────────────

export const RecordManualPaymentSchema = z.object({
  amount: z.number().int().min(1, 'Amount must be at least 1 cent').max(1_000_000_000),
  /** e.g. check number, cash note — stored in ledger metadata. */
  reference: optStr(300),
})
export type RecordManualPaymentInput = z.infer<typeof RecordManualPaymentSchema>

export const RefundPaymentSchema = z.object({
  /** Ledger payment row being refunded. */
  payment_id: z.string().uuid(),
  /** Cents; must not exceed the original payment. Omit for full refund. */
  amount: z.number().int().min(1).max(1_000_000_000).optional(),
  reason: z.string().min(5, 'A reason of at least 5 characters is required').max(1000).transform((v) => v.trim()),
})
export type RefundPaymentInput = z.infer<typeof RefundPaymentSchema>

export const CreditInvoiceSchema = z.object({
  amount: z.number().int().min(1).max(1_000_000_000),
  reason: z.string().min(5, 'A reason of at least 5 characters is required').max(1000).transform((v) => v.trim()),
})
export type CreditInvoiceInput = z.infer<typeof CreditInvoiceSchema>

// ─── List query ───────────────────────────────────────────────────────────────

export const ListInvoicesQuerySchema = z.object({
  q: optStr(200),
  status: z.nativeEnum(InvoiceStatus).optional(),
  work_order_id: optUUID(),
  estimate_id: optUUID(),
  invoice_kind: z.enum(['standard', 'deposit', 'milestone', 'final']).optional(),
})
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>

// ─── Reconciliation ───────────────────────────────────────────────────────────

export const ResolveReconciliationFindingSchema = z.object({
  status: z.enum(['resolved', 'ignored']),
  resolution_reason: z.string().min(5, 'A reason of at least 5 characters is required').max(1000).transform((v) => v.trim()),
})
export type ResolveReconciliationFindingInput = z.infer<typeof ResolveReconciliationFindingSchema>
