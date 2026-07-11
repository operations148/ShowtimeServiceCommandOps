import { z } from "zod";
import { PRICEBOOK_ITEM_TYPES, type PricebookItemType } from "@/types/pricebook";

// ─── Shared helpers (same conventions as validation/invoice.ts) ──────────────

function optStr(maxLen = 2000) {
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

function cents(label: string) {
  return z
    .number()
    .int(`${label} must be a whole number of cents`)
    .min(0, `${label} must be >= 0`)
    .max(100_000_000, `${label} exceeds the maximum`); // $1M cap per line item
}

const itemType = z.enum(PRICEBOOK_ITEM_TYPES as [PricebookItemType, ...PricebookItemType[]]);

/** Optimistic-concurrency token: the version the client last read. */
const versionToken = z
  .number()
  .int("version must be an integer")
  .min(1, "version must be >= 1");

// ─── Categories ───────────────────────────────────────────────────────────────

export const CreateCategorySchema = z.object({
  name: z.string().min(1, "Name is required").max(120).transform((v) => v.trim()),
  description: optStr(1000),
  sort_order: z.number().int().min(0).max(100000).default(0),
});
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

export const PatchCategorySchema = z.object({
  version: versionToken,
  name: z.string().min(1).max(120).transform((v) => v.trim()).optional(),
  description: optStr(1000),
  sort_order: z.number().int().min(0).max(100000).optional(),
  is_active: z.boolean().optional(),
});
export type PatchCategoryInput = z.infer<typeof PatchCategorySchema>;

// ─── Items ────────────────────────────────────────────────────────────────────

export const CreateItemSchema = z.object({
  category_id: optUUID(),
  item_type: itemType.default("service"),
  name: z.string().min(1, "Name is required").max(200).transform((v) => v.trim()),
  description: optStr(5000),
  unit: optStr(40),
  default_quantity: z.number().min(0).max(1_000_000).default(1),
  customer_price: cents("Customer price").default(0),
  internal_cost: cents("Internal cost").default(0),
  taxable: z.boolean().default(true),
  tax_category: optStr(80),
  vendor_reference: optStr(200),
  notes: optStr(5000),
  sort_order: z.number().int().min(0).max(100000).default(0),
});
export type CreateItemInput = z.infer<typeof CreateItemSchema>;

export const PatchItemSchema = z.object({
  version: versionToken,
  category_id: z
    .string()
    .uuid("Invalid UUID")
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)), // null clears the category; undefined leaves it
  item_type: itemType.optional(),
  name: z.string().min(1).max(200).transform((v) => v.trim()).optional(),
  description: optStr(5000),
  unit: optStr(40),
  default_quantity: z.number().min(0).max(1_000_000).optional(),
  customer_price: cents("Customer price").optional(),
  internal_cost: cents("Internal cost").optional(),
  taxable: z.boolean().optional(),
  tax_category: optStr(80),
  vendor_reference: optStr(200),
  notes: optStr(5000),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
});
export type PatchItemInput = z.infer<typeof PatchItemSchema>;

// ─── List query (GET /api/pricebook/items) ────────────────────────────────────

export const ListItemsQuerySchema = z.object({
  q: optStr(200),
  item_type: itemType.optional(),
  category_id: optUUID(),
  /** "true" includes archived items (requires canArchivePricebookItems to matter in UI; harmless otherwise). */
  include_archived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});
export type ListItemsQuery = z.infer<typeof ListItemsQuerySchema>;

// ─── Bundle composition ───────────────────────────────────────────────────────

export const SetBundleChildrenSchema = z.object({
  version: versionToken, // of the bundle item — bundle edits bump its version too
  children: z
    .array(
      z.object({
        child_item_id: z.string().uuid("Invalid child item id"),
        quantity: z.number().gt(0, "Quantity must be > 0").max(1_000_000),
        sort_order: z.number().int().min(0).max(100000).default(0),
      })
    )
    .max(100, "A bundle may contain at most 100 items"),
});
export type SetBundleChildrenInput = z.infer<typeof SetBundleChildrenSchema>;
