export type EstimateStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'converted'

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'refunded'

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'

export interface EstimateItem {
  id: string
  estimate_id: string
  tenant_id: string
  sort_order: number
  description: string
  details?: string | null
  quantity: number
  unit_price: number   // cents
  total: number        // cents
  created_at: string
}

export interface Estimate {
  id: string
  tenant_id: string
  work_order_id?: string | null
  property_id?: string | null
  ghl_contact_id?: string | null
  ghl_opportunity_id?: string | null
  estimate_number: string
  title: string
  status: EstimateStatus
  customer_name: string
  customer_email?: string | null
  customer_phone?: string | null
  customer_address?: string | null
  issue_date: string
  expiry_date?: string | null
  accepted_at?: string | null
  declined_at?: string | null
  sent_at?: string | null
  viewed_at?: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total: number
  notes?: string | null
  terms?: string | null
  internal_notes?: string | null
  public_token: string
  converted_to_invoice_id?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
  items?: EstimateItem[]
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  tenant_id: string
  sort_order: number
  description: string
  details?: string | null
  quantity: number
  unit_price: number   // cents
  total: number        // cents
  created_at: string
}

export interface Invoice {
  id: string
  tenant_id: string
  estimate_id?: string | null
  work_order_id?: string | null
  property_id?: string | null
  ghl_contact_id?: string | null
  ghl_opportunity_id?: string | null
  invoice_number: string
  title: string
  status: InvoiceStatus
  customer_name: string
  customer_email?: string | null
  customer_phone?: string | null
  customer_address?: string | null
  issue_date: string
  due_date?: string | null
  sent_at?: string | null
  viewed_at?: string | null
  paid_at?: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  total: number
  amount_paid: number
  amount_due: number
  notes?: string | null
  terms?: string | null
  payment_instructions?: string | null
  stripe_payment_intent_id?: string | null
  stripe_payment_link?: string | null
  public_token: string
  created_by?: string | null
  created_at: string
  updated_at: string
  items?: InvoiceItem[]
}

export interface Payment {
  id: string
  tenant_id: string
  invoice_id: string
  amount: number
  currency: string
  status: PaymentStatus
  payment_method?: string | null
  stripe_payment_intent_id?: string | null
  stripe_charge_id?: string | null
  customer_email?: string | null
  paid_at?: string | null
  failed_at?: string | null
  failure_reason?: string | null
  created_at: string
  updated_at: string
}

// ─── Form input types ─────────────────────────────────────────────────────────

export interface EstimateItemInput {
  description: string
  details?: string
  quantity: number
  unit_price: number  // dollars (user enters, converted to cents server-side)
}

export interface CreateEstimateInput {
  work_order_id?: string
  property_id?: string
  ghl_contact_id?: string
  title: string
  customer_name: string
  customer_email?: string
  customer_phone?: string
  customer_address?: string
  expiry_date?: string
  items: EstimateItemInput[]
  tax_rate?: number
  discount_amount?: number  // dollars
  notes?: string
  terms?: string
}
