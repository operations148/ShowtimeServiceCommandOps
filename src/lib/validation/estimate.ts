import { z } from "zod";

// ─── Shared helpers (same conventions as validation/pricebook.ts) ────────────

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

function optDatetime() {
  return z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));
}

const cents = (label: string) =>
  z.number().int(`${label} must be whole cents`).min(0, `${label} must be >= 0`).max(1_000_000_000);

const versionToken = z.number().int().min(1, "version must be >= 1");

// ─── Line item input ──────────────────────────────────────────────────────────
// A line either references a pricebook item (snapshotted server-side) or is a
// fully custom line. Client-supplied prices are re-validated; totals are always
// recomputed server-side and never trusted from the client.

export const EstimateLineInputSchema = z.object({
  kind: z.enum(["standard", "optional", "recommended"]).default("standard"),
  option_group: optStr(80),
  is_selected: z.boolean().default(true),

  // Snapshot source (optional — custom lines omit it)
  source_pricebook_item_id: optUUID(),

  name: z.string().min(1, "Name is required").max(200).transform((v) => v.trim()),
  description: optStr(5000),
  unit: optStr(40),
  quantity: z.number().min(0, "Quantity must be >= 0").max(1_000_000).default(1),
  unit_price: cents("Unit price"),
  unit_cost: cents("Unit cost").default(0),
  taxable: z.boolean().default(true),
  tax_category: optStr(80),
  discount_amount: cents("Discount").default(0),
  markup_percent: z.number().min(0).max(1000).optional(),
});
export type EstimateLineInput = z.infer<typeof EstimateLineInputSchema>;

// ─── Create ───────────────────────────────────────────────────────────────────

export const CreateEstimateSchema = z.object({
  estimate_handoff_id: optUUID(),
  work_order_id: optUUID(),
  property_id: optUUID(),
  ghl_contact_id: optStr(100),
  ghl_opportunity_id: optStr(100),

  title: z.string().min(1, "Title is required").max(200).transform((v) => v.trim()),

  customer_name: z.string().min(1, "Customer name is required").max(200).transform((v) => v.trim()),
  customer_email: z.string().email("Invalid email").optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  customer_phone: optStr(30),
  customer_address: optStr(500),

  issue_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (YYYY-MM-DD)")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
  expires_at: optDatetime(),

  assigned_estimator_id: optUUID(),
  proposal_template: z.string().max(60).default("standard"),

  tax_rate: z.number().min(0, "Tax rate must be >= 0").max(1, "Tax rate must be <= 1").default(0),
  discount_amount: cents("Discount").default(0),

  internal_notes: optStr(5000),
  customer_notes: optStr(5000),
  terms: optStr(5000),

  line_items: z.array(EstimateLineInputSchema).max(200, "Too many line items").default([]),
});
export type CreateEstimateInput = z.infer<typeof CreateEstimateSchema>;

// ─── Patch (draft/ready edits only — enforced server-side) ────────────────────

export const PatchEstimateSchema = z.object({
  version: versionToken,

  title: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  customer_name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  customer_email: z.string().email("Invalid email").optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
  customer_phone: optStr(30),
  customer_address: optStr(500),

  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expires_at: optDatetime(),
  assigned_estimator_id: optUUID(),
  proposal_template: z.string().max(60).optional(),

  tax_rate: z.number().min(0).max(1).optional(),
  discount_amount: cents("Discount").optional(),

  internal_notes: optStr(5000),
  customer_notes: optStr(5000),
  terms: optStr(5000),

  // When present, replaces the full line-item set (totals recomputed server-side)
  line_items: z.array(EstimateLineInputSchema).max(200).optional(),
});
export type PatchEstimateInput = z.infer<typeof PatchEstimateSchema>;

// ─── Status transition (admin) ────────────────────────────────────────────────

export const EstimateTransitionSchema = z.object({
  version: versionToken,
  to: z.enum(["draft", "ready", "sent", "voided"]),
});
export type EstimateTransitionInput = z.infer<typeof EstimateTransitionSchema>;

// ─── Admin override (mandatory reason) ────────────────────────────────────────

export const EstimateOverrideSchema = z.object({
  reason: z.string().min(5, "A reason of at least 5 characters is required").max(1000).transform((v) => v.trim()),
});
export type EstimateOverrideInput = z.infer<typeof EstimateOverrideSchema>;

// ─── Send (manual) ────────────────────────────────────────────────────────────

export const EstimateSendSchema = z.object({
  version: versionToken,
  // Optional explicit recipient override; defaults to the estimate's customer_email.
  recipient_email: z.string().email("Invalid recipient email").optional(),
  // Token lifetime in days (default 30, capped)
  expires_in_days: z.number().int().min(1).max(90).default(30),
});
export type EstimateSendInput = z.infer<typeof EstimateSendSchema>;

// ─── List query ───────────────────────────────────────────────────────────────

export const ListEstimatesQuerySchema = z.object({
  q: optStr(200),
  status: z
    .enum(["draft", "ready", "sent", "viewed", "accepted", "declined", "expired", "converted", "voided"])
    .optional(),
  work_order_id: optUUID(),
});
export type ListEstimatesQuery = z.infer<typeof ListEstimatesQuerySchema>;

// ─── Public decision inputs (customer-facing, unauthenticated) ────────────────

export const PublicAcceptSchema = z.object({
  version: versionToken,
  // Selected optional/recommended line ids (standard lines are always included)
  selected_line_ids: z.array(z.string().uuid()).max(200).default([]),
  accepted_by_name: z.string().min(1, "Please type your name").max(200).transform((v) => v.trim()),
  signature: optStr(10000), // optional data-URL or typed signature string
  terms_acknowledged: z.literal(true, { message: "You must acknowledge the terms" }),
});
export type PublicAcceptInput = z.infer<typeof PublicAcceptSchema>;

export const PublicDeclineSchema = z.object({
  version: versionToken,
  reason: z.string().max(2000).optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v)),
});
export type PublicDeclineInput = z.infer<typeof PublicDeclineSchema>;
