// Pricebook domain types (Phase 2). Mirrors migration 20260711000002.
// All money values are integer cents (see src/lib/money/money.ts).

export type PricebookItemType =
  | "service"
  | "labor"
  | "material"
  | "equipment"
  | "fee"
  | "discount"
  | "bundle";

export const PRICEBOOK_ITEM_TYPES: PricebookItemType[] = [
  "service",
  "labor",
  "material",
  "equipment",
  "fee",
  "discount",
  "bundle",
];

export interface PricebookCategory {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  archived_at?: string | null;
  /** Optimistic-concurrency token — send back unchanged on PATCH. */
  version: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PricebookItem {
  id: string;
  tenant_id: string;
  category_id?: string | null;
  item_type: PricebookItemType;
  name: string;
  description?: string | null;
  unit?: string | null;
  default_quantity: number;
  /** Cents. */
  customer_price: number;
  /**
   * Cents. Present ONLY when the caller holds canViewItemCosts — the API
   * strips this field server-side for everyone else (never trust UI hiding).
   */
  internal_cost?: number;
  taxable: boolean;
  tax_category?: string | null;
  vendor_reference?: string | null;
  image_path?: string | null;
  notes?: string | null;
  is_active: boolean;
  sort_order: number;
  archived_at?: string | null;
  /** Optimistic-concurrency token AND snapshot source version. */
  version: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  /** Populated only for item_type === "bundle" when explicitly requested. */
  bundle_items?: PricebookBundleItem[];
}

export interface PricebookBundleItem {
  id: string;
  tenant_id: string;
  bundle_id: string;
  child_item_id: string;
  quantity: number;
  sort_order: number;
  created_at: string;
  /** Joined child item summary, when requested. */
  child?: Pick<PricebookItem, "id" | "name" | "item_type" | "customer_price" | "unit">;
}
