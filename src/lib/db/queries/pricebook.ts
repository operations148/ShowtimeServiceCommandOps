import { db } from "@/lib/db/client";
import type {
  PricebookCategory,
  PricebookItem,
  PricebookBundleItem,
  PricebookItemType,
} from "@/types/pricebook";
import type {
  CreateCategoryInput,
  PatchCategoryInput,
  CreateItemInput,
  PatchItemInput,
  ListItemsQuery,
  SetBundleChildrenInput,
} from "@/lib/validation/pricebook";

// ─── Result unions ────────────────────────────────────────────────────────────

export type PricebookWriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; notFound: true }
  /** Optimistic-concurrency failure: the row changed since the client read it. */
  | { ok: false; conflict: true; currentVersion: number }
  | { ok: false; duplicateName: true };

// ─── Row types ────────────────────────────────────────────────────────────────

type CategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  archived_at: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  tenant_id: string;
  category_id: string | null;
  item_type: string;
  name: string;
  description: string | null;
  unit: string | null;
  default_quantity: number | string; // NUMERIC may arrive as string
  customer_price: number;
  internal_cost: number;
  taxable: boolean;
  tax_category: string | null;
  vendor_reference: string | null;
  image_path: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
  archived_at: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type BundleItemRow = {
  id: string;
  tenant_id: string;
  bundle_id: string;
  child_item_id: string;
  quantity: number | string;
  sort_order: number;
  created_at: string;
};

function mapCategory(row: CategoryRow): PricebookCategory {
  return { ...row };
}

function mapItem(row: ItemRow): PricebookItem {
  return {
    ...row,
    item_type: row.item_type as PricebookItemType,
    default_quantity: Number(row.default_quantity),
  };
}

function mapBundleItem(row: BundleItemRow): PricebookBundleItem {
  return { ...row, quantity: Number(row.quantity) };
}

const PG_UNIQUE_VIOLATION = "23505";

// ─── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(
  tenantId: string,
  opts: { includeArchived?: boolean } = {}
): Promise<PricebookCategory[]> {
  let query = db
    .from("pricebook_categories")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!opts.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new Error(`[db] listCategories: ${error.message}`);
  return ((data ?? []) as CategoryRow[]).map(mapCategory);
}

export async function createCategory(
  input: CreateCategoryInput,
  tenantId: string,
  userId: string
): Promise<PricebookWriteResult<PricebookCategory>> {
  const { data, error } = await db
    .from("pricebook_categories")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      description: input.description ?? null,
      sort_order: input.sort_order,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return { ok: false, duplicateName: true };
    throw new Error(`[db] createCategory: ${error.message}`);
  }
  return { ok: true, data: mapCategory(data as CategoryRow) };
}

export async function patchCategory(
  id: string,
  patch: PatchCategoryInput,
  tenantId: string,
  userId: string
): Promise<PricebookWriteResult<PricebookCategory>> {
  const payload: Record<string, unknown> = { updated_by: userId, version: patch.version + 1 };
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.sort_order !== undefined) payload.sort_order = patch.sort_order;
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;

  // Optimistic concurrency: the version predicate makes stale writes match
  // zero rows instead of silently overwriting a concurrent edit.
  const { data, error } = await db
    .from("pricebook_categories")
    .update(payload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("version", patch.version)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return { ok: false, duplicateName: true };
    throw new Error(`[db] patchCategory: ${error.message}`);
  }
  if (data) return { ok: true, data: mapCategory(data as CategoryRow) };

  return classifyMissedWrite("pricebook_categories", id, tenantId);
}

export async function archiveCategory(
  id: string,
  tenantId: string,
  userId: string
): Promise<PricebookWriteResult<PricebookCategory>> {
  const { data, error } = await db
    .from("pricebook_categories")
    .update({ archived_at: new Date().toISOString(), is_active: false, updated_by: userId })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`[db] archiveCategory: ${error.message}`);
  if (!data) return { ok: false, notFound: true };
  return { ok: true, data: mapCategory(data as CategoryRow) };
}

export async function restoreCategory(
  id: string,
  tenantId: string,
  userId: string
): Promise<PricebookWriteResult<PricebookCategory>> {
  const { data, error } = await db
    .from("pricebook_categories")
    .update({ archived_at: null, is_active: true, updated_by: userId })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`[db] restoreCategory: ${error.message}`);
  if (!data) return { ok: false, notFound: true };
  return { ok: true, data: mapCategory(data as CategoryRow) };
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function listItems(
  tenantId: string,
  query: ListItemsQuery
): Promise<PricebookItem[]> {
  let q = db
    .from("pricebook_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!query.include_archived) q = q.is("archived_at", null);
  if (query.item_type !== undefined) q = q.eq("item_type", query.item_type);
  if (query.category_id !== undefined) q = q.eq("category_id", query.category_id);
  if (query.active !== undefined) q = q.eq("is_active", query.active);
  if (query.q !== undefined) {
    // Escape PostgREST or() pattern metacharacters, then match name OR description.
    const term = query.q.replace(/[%_\\,()]/g, (c) => `\\${c}`);
    q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const { data, error } = await q;
  if (error) throw new Error(`[db] listItems: ${error.message}`);
  return ((data ?? []) as ItemRow[]).map(mapItem);
}

export async function getItemById(
  id: string,
  tenantId: string,
  opts: { withBundle?: boolean } = {}
): Promise<PricebookItem | undefined> {
  const { data, error } = await db
    .from("pricebook_items")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(`[db] getItemById: ${error.message}`);
  if (!data) return undefined;

  const item = mapItem(data as ItemRow);
  if (opts.withBundle && item.item_type === "bundle") {
    item.bundle_items = await getBundleChildren(id, tenantId);
  }
  return item;
}

export async function createItem(
  input: CreateItemInput,
  tenantId: string,
  userId: string
): Promise<PricebookWriteResult<PricebookItem>> {
  // Tenant-scoped ownership check on the category reference (never trust a raw FK)
  if (input.category_id !== undefined) {
    const owned = await categoryBelongsToTenant(input.category_id, tenantId);
    if (!owned) return { ok: false, notFound: true };
  }

  const { data, error } = await db
    .from("pricebook_items")
    .insert({
      tenant_id: tenantId,
      category_id: input.category_id ?? null,
      item_type: input.item_type,
      name: input.name,
      description: input.description ?? null,
      unit: input.unit ?? null,
      default_quantity: input.default_quantity,
      customer_price: input.customer_price,
      internal_cost: input.internal_cost,
      taxable: input.taxable,
      tax_category: input.tax_category ?? null,
      vendor_reference: input.vendor_reference ?? null,
      notes: input.notes ?? null,
      sort_order: input.sort_order,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(`[db] createItem: ${error.message}`);
  return { ok: true, data: mapItem(data as ItemRow) };
}

export async function patchItem(
  id: string,
  patch: PatchItemInput,
  tenantId: string,
  userId: string
): Promise<PricebookWriteResult<PricebookItem>> {
  if (patch.category_id !== undefined && patch.category_id !== null) {
    const owned = await categoryBelongsToTenant(patch.category_id, tenantId);
    if (!owned) return { ok: false, notFound: true };
  }

  const payload: Record<string, unknown> = { updated_by: userId, version: patch.version + 1 };
  if (patch.category_id !== undefined) payload.category_id = patch.category_id;
  if (patch.item_type !== undefined) payload.item_type = patch.item_type;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.unit !== undefined) payload.unit = patch.unit;
  if (patch.default_quantity !== undefined) payload.default_quantity = patch.default_quantity;
  if (patch.customer_price !== undefined) payload.customer_price = patch.customer_price;
  if (patch.internal_cost !== undefined) payload.internal_cost = patch.internal_cost;
  if (patch.taxable !== undefined) payload.taxable = patch.taxable;
  if (patch.tax_category !== undefined) payload.tax_category = patch.tax_category;
  if (patch.vendor_reference !== undefined) payload.vendor_reference = patch.vendor_reference;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;
  if (patch.sort_order !== undefined) payload.sort_order = patch.sort_order;

  const { data, error } = await db
    .from("pricebook_items")
    .update(payload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("version", patch.version)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`[db] patchItem: ${error.message}`);
  if (data) return { ok: true, data: mapItem(data as ItemRow) };

  return classifyMissedWrite("pricebook_items", id, tenantId);
}

export async function archiveItem(
  id: string,
  tenantId: string,
  userId: string
): Promise<PricebookWriteResult<PricebookItem>> {
  const { data, error } = await db
    .from("pricebook_items")
    .update({ archived_at: new Date().toISOString(), is_active: false, updated_by: userId })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`[db] archiveItem: ${error.message}`);
  if (!data) return { ok: false, notFound: true };
  return { ok: true, data: mapItem(data as ItemRow) };
}

export async function restoreItem(
  id: string,
  tenantId: string,
  userId: string
): Promise<PricebookWriteResult<PricebookItem>> {
  const { data, error } = await db
    .from("pricebook_items")
    .update({ archived_at: null, is_active: true, updated_by: userId })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`[db] restoreItem: ${error.message}`);
  if (!data) return { ok: false, notFound: true };
  return { ok: true, data: mapItem(data as ItemRow) };
}

export async function setItemImage(
  id: string,
  tenantId: string,
  imagePath: string | null,
  userId: string
): Promise<PricebookWriteResult<PricebookItem>> {
  const { data, error } = await db
    .from("pricebook_items")
    .update({ image_path: imagePath, updated_by: userId })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`[db] setItemImage: ${error.message}`);
  if (!data) return { ok: false, notFound: true };
  return { ok: true, data: mapItem(data as ItemRow) };
}

// ─── Bundles ──────────────────────────────────────────────────────────────────

export async function getBundleChildren(
  bundleId: string,
  tenantId: string
): Promise<PricebookBundleItem[]> {
  const { data, error } = await db
    .from("pricebook_bundle_items")
    .select("*, child:pricebook_items!pricebook_bundle_items_child_item_id_fkey(id,name,item_type,customer_price,unit)")
    .eq("bundle_id", bundleId)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`[db] getBundleChildren: ${error.message}`);
  return ((data ?? []) as (BundleItemRow & { child: PricebookBundleItem["child"] })[]).map(
    (row) => ({ ...mapBundleItem(row), child: row.child })
  );
}

export type SetBundleChildrenResult =
  | { ok: true; data: PricebookBundleItem[] }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true; currentVersion: number }
  | { ok: false; invalidChildren: string[] }
  | { ok: false; notABundle: true };

/**
 * Replaces a bundle's composition. Every child must belong to the same
 * tenant, must not be the bundle itself, and must not itself be a bundle
 * (no nesting — keeps snapshot expansion single-level, see ADR-0006).
 */
export async function setBundleChildren(
  bundleId: string,
  input: SetBundleChildrenInput,
  tenantId: string,
  userId: string
): Promise<SetBundleChildrenResult> {
  const bundle = await getItemById(bundleId, tenantId);
  if (!bundle) return { ok: false, notFound: true };
  if (bundle.item_type !== "bundle") return { ok: false, notABundle: true };

  // Tenant-scoped ownership + no-nesting validation of all children in one query.
  const childIds = input.children.map((c) => c.child_item_id);
  const invalid = new Set<string>(childIds);
  if (childIds.includes(bundleId)) {
    return { ok: false, invalidChildren: [bundleId] };
  }
  if (childIds.length > 0) {
    const { data: found, error } = await db
      .from("pricebook_items")
      .select("id, item_type")
      .eq("tenant_id", tenantId)
      .in("id", childIds);
    if (error) throw new Error(`[db] setBundleChildren validate: ${error.message}`);
    for (const row of (found ?? []) as { id: string; item_type: string }[]) {
      if (row.item_type !== "bundle") invalid.delete(row.id);
    }
    if (invalid.size > 0) return { ok: false, invalidChildren: [...invalid] };
  }

  // Optimistic-concurrency gate on the bundle row itself.
  const { data: bumped, error: bumpError } = await db
    .from("pricebook_items")
    .update({ version: input.version + 1, updated_by: userId })
    .eq("id", bundleId)
    .eq("tenant_id", tenantId)
    .eq("version", input.version)
    .select("id")
    .maybeSingle();
  if (bumpError) throw new Error(`[db] setBundleChildren bump: ${bumpError.message}`);
  if (!bumped) {
    const missed = await classifyMissedWrite("pricebook_items", bundleId, tenantId);
    return missed as SetBundleChildrenResult;
  }

  const { error: delError } = await db
    .from("pricebook_bundle_items")
    .delete()
    .eq("bundle_id", bundleId)
    .eq("tenant_id", tenantId);
  if (delError) throw new Error(`[db] setBundleChildren delete: ${delError.message}`);

  if (input.children.length > 0) {
    const { error: insError } = await db.from("pricebook_bundle_items").insert(
      input.children.map((c) => ({
        tenant_id: tenantId,
        bundle_id: bundleId,
        child_item_id: c.child_item_id,
        quantity: c.quantity,
        sort_order: c.sort_order,
      }))
    );
    if (insError) throw new Error(`[db] setBundleChildren insert: ${insError.message}`);
  }

  return { ok: true, data: await getBundleChildren(bundleId, tenantId) };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function categoryBelongsToTenant(categoryId: string, tenantId: string): Promise<boolean> {
  const { data, error } = await db
    .from("pricebook_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`[db] categoryBelongsToTenant: ${error.message}`);
  return data !== null;
}

/**
 * A version-predicated UPDATE matched zero rows: either the row doesn't exist
 * for this tenant (404) or it exists at a different version (409 + current
 * version so the client can re-fetch and re-apply).
 */
async function classifyMissedWrite(
  table: "pricebook_items" | "pricebook_categories",
  id: string,
  tenantId: string
): Promise<{ ok: false; notFound: true } | { ok: false; conflict: true; currentVersion: number }> {
  const { data, error } = await db
    .from(table)
    .select("version")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`[db] classifyMissedWrite: ${error.message}`);
  if (!data) return { ok: false, notFound: true };
  return { ok: false, conflict: true, currentVersion: (data as { version: number }).version };
}
