import { z } from 'zod'
import { InvoiceStatus } from '@/types/invoice'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Optional string — coerces empty string to undefined (tolerates HTML form sends)
function optStr(maxLen = 5000) {
  return z
    .string()
    .max(maxLen)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v))
}

// Optional UUID — coerces empty string to undefined
function optUUID() {
  return z
    .string()
    .uuid('Invalid UUID')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v))
}

// Optional date string YYYY-MM-DD — coerces empty string to undefined
function optDate() {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (expected YYYY-MM-DD)')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v))
}

// Non-negative integer for money amounts in cents
function cents(label: string) {
  return z
    .number()
    .int(`${label} must be a whole number of cents`)
    .min(0, `${label} must be >= 0`)
}

// ─── CreateInvoiceSchema ──────────────────────────────────────────────────────
// Used for POST /api/invoices — tenant_id injected server-side from session.
// Typically called by the system when auto-creating from an accepted estimate;
// also supports manual creation from the admin UI.

export const CreateInvoiceSchema = z.object({
  // FK references
  estimate_handoff_id: optUUID(),
  work_order_id:       optUUID(),
  property_id:         optUUID(),
  ghl_opportunity_id:  optStr(100),

  // Identity
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or less')
    .transform((v) => v.trim()),

  // Customer snapshot
  customer_name: z
    .string()
    .min(1, 'Customer name is required')
    .max(200, 'Customer name must be 200 characters or less')
    .transform((v) => v.trim()),
  customer_email: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  customer_phone:   optStr(30),
  customer_address: optStr(500),

  // Dates
  issue_date: optDate(),
  due_date:   optDate(),

  // Money — all cents
  subtotal:        cents('Subtotal'),
  tax_rate:        z.number().min(0, 'Tax rate must be >= 0').max(1, 'Tax rate must be <= 1').default(0),
  tax_amount:      cents('Tax amount').default(0),
  discount_amount: cents('Discount').default(0),
  total:           cents('Total'),

  // Deposit — minimum 10 % per spec
  deposit_percent:  z.number().min(10, 'Deposit must be at least 10 %').max(100).default(10),
  deposit_amount:   cents('Deposit amount').default(0),
  deposit_required: z.boolean().default(true),

  // Content
  notes:                optStr(5000),
  terms:                optStr(5000),
  payment_instructions: optStr(2000),
})

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>

// ─── PatchInvoiceSchema ───────────────────────────────────────────────────────
// Used for PATCH /api/invoices/[id] — all fields optional.
// Status transition validity is enforced in the route handler via
// INVOICE_STATUS_TRANSITIONS, not here.

export const PatchInvoiceSchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),

  // Identity
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200)
    .transform((v) => v.trim())
    .optional(),

  // Customer snapshot
  customer_email: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  customer_phone:   optStr(30),
  customer_address: optStr(500),

  // Dates
  due_date:   optDate(),
  sent_at:    z.string().datetime({ offset: true }).optional(),
  viewed_at:  z.string().datetime({ offset: true }).optional(),
  paid_at:    z.string().datetime({ offset: true }).optional(),

  // Money — all cents
  subtotal:        cents('Subtotal').optional(),
  tax_rate:        z.number().min(0).max(1).optional(),
  tax_amount:      cents('Tax amount').optional(),
  discount_amount: cents('Discount').optional(),
  total:           cents('Total').optional(),
  amount_paid:     cents('Amount paid').optional(),

  // Deposit
  deposit_percent:  z.number().min(10, 'Deposit must be at least 10 %').max(100).optional(),
  deposit_amount:   cents('Deposit amount').optional(),
  deposit_required: z.boolean().optional(),

  // Content
  notes:                optStr(5000),
  terms:                optStr(5000),
  payment_instructions: optStr(2000),

  // Stripe
  stripe_payment_intent_id:   z.string().optional(),
  stripe_payment_link:        z.string().url('Invalid URL').optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  stripe_checkout_session_id: z.string().optional(),
})

export type PatchInvoiceInput = z.infer<typeof PatchInvoiceSchema>
