import { z } from "zod";

// ─── Shared helpers (same conventions as validation/estimate.ts) ─────────────

function optStr(maxLen = 5000) {
  return z
    .string()
    .max(maxLen)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));
}

function optUUID() {
  return z
    .string()
    .uuid("Invalid UUID")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));
}

const cents = (label: string) =>
  z.number().int(`${label} must be whole cents`).min(0, `${label} must be >= 0`).max(1_000_000_000);

const versionToken = z.number().int().min(1, "version must be >= 1");

// ─── Line item input ──────────────────────────────────────────────────────────

export const ChangeOrderLineInputSchema = z.object({
  source_pricebook_item_id: optUUID(),
  name: z.string().min(1, "Name is required").max(200).transform((v) => v.trim()),
  description: optStr(5000),
  unit: optStr(40),
  quantity: z.number().min(0, "Quantity must be >= 0").max(1_000_000).default(1),
  unit_price: cents("Unit price"),
  unit_cost: cents("Unit cost").default(0),
  taxable: z.boolean().default(true),
  discount_amount: cents("Discount").default(0),
});
export type ChangeOrderLineInput = z.infer<typeof ChangeOrderLineInputSchema>;

// ─── Create ───────────────────────────────────────────────────────────────────

export const CreateChangeOrderSchema = z.object({
  reason: z.string().min(5, "A reason of at least 5 characters is required").max(2000).transform((v) => v.trim()),
  scope_description: optStr(5000),

  customer_name: z.string().min(1, "Customer name is required").max(200).transform((v) => v.trim()),
  customer_email: z.string().email("Invalid email").optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),

  tax_rate: z.number().min(0, "Tax rate must be >= 0").max(1, "Tax rate must be <= 1").default(0),

  schedule_impact_days: z.number().int().min(0).max(3650).optional(),
  schedule_impact_note: optStr(2000),

  blocks_closeout: z.boolean().default(true),

  internal_notes: optStr(5000),
  customer_notes: optStr(5000),

  line_items: z.array(ChangeOrderLineInputSchema).max(200, "Too many line items").default([]),
});
export type CreateChangeOrderInput = z.infer<typeof CreateChangeOrderSchema>;

// ─── Patch (draft only — enforced server-side) ────────────────────────────────

export const PatchChangeOrderSchema = z.object({
  version: versionToken,

  reason: z.string().min(5).max(2000).transform((v) => v.trim()).optional(),
  scope_description: optStr(5000),
  customer_name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  customer_email: z.string().email("Invalid email").optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  tax_rate: z.number().min(0).max(1).optional(),
  schedule_impact_days: z.number().int().min(0).max(3650).nullable().optional(),
  schedule_impact_note: optStr(2000),
  blocks_closeout: z.boolean().optional(),
  internal_notes: optStr(5000),
  customer_notes: optStr(5000),

  line_items: z.array(ChangeOrderLineInputSchema).max(200).optional(),
});
export type PatchChangeOrderInput = z.infer<typeof PatchChangeOrderSchema>;

// ─── Status transition (admin) ────────────────────────────────────────────────

export const ChangeOrderTransitionSchema = z.object({
  version: versionToken,
  to: z.enum(["draft", "voided"]),
});
export type ChangeOrderTransitionInput = z.infer<typeof ChangeOrderTransitionSchema>;

// ─── Admin override (mandatory reason) ────────────────────────────────────────

export const ChangeOrderOverrideSchema = z.object({
  reason: z.string().min(5, "A reason of at least 5 characters is required").max(1000).transform((v) => v.trim()),
});
export type ChangeOrderOverrideInput = z.infer<typeof ChangeOrderOverrideSchema>;

// ─── Send (manual) ────────────────────────────────────────────────────────────

export const ChangeOrderSendSchema = z.object({
  version: versionToken,
  recipient_email: z.string().email("Invalid recipient email").optional(),
  expires_in_days: z.number().int().min(1).max(90).default(30),
});
export type ChangeOrderSendInput = z.infer<typeof ChangeOrderSendSchema>;

// ─── Apply schedule impact (explicit action, never automatic — ADR-0011) ──────

export const ApplyScheduleImpactSchema = z.object({
  /** The visit whose date is being moved to absorb the schedule impact. */
  visit_id: z.string().uuid(),
  new_scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (YYYY-MM-DD)"),
});
export type ApplyScheduleImpactInput = z.infer<typeof ApplyScheduleImpactSchema>;

// ─── List query ───────────────────────────────────────────────────────────────

export const ListChangeOrdersQuerySchema = z.object({
  q: optStr(200),
  status: z.enum(["draft", "sent", "viewed", "accepted", "rejected", "expired", "voided"]).optional(),
  work_order_id: optUUID(),
});
export type ListChangeOrdersQuery = z.infer<typeof ListChangeOrdersQuerySchema>;

// ─── Public decision inputs (customer-facing, unauthenticated) ────────────────

export const PublicAcceptChangeOrderSchema = z.object({
  version: versionToken,
  accepted_by_name: z.string().min(1, "Please type your name").max(200).transform((v) => v.trim()),
  signature: optStr(10000),
});
export type PublicAcceptChangeOrderInput = z.infer<typeof PublicAcceptChangeOrderSchema>;

export const PublicRejectChangeOrderSchema = z.object({
  version: versionToken,
  reason: z.string().max(2000).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});
export type PublicRejectChangeOrderInput = z.infer<typeof PublicRejectChangeOrderSchema>;
