"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  BookOpen,
  Plus,
  Search,
  Download,
  Archive,
  ArchiveRestore,
  Pencil,
  FolderCog,
  Loader2,
  X,
} from "lucide-react";
import type { PricebookItem, PricebookCategory, PricebookItemType } from "@/types/pricebook";
import { PRICEBOOK_ITEM_TYPES } from "@/types/pricebook";
import { rolePermissions, type RolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingRows } from "@/components/ui/LoadingState";
import { useApiQuery } from "@/lib/utils/useApiQuery";
import { cn } from "@/lib/utils";

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<PricebookItemType, string> = {
  service: "Service",
  labor: "Labor",
  material: "Material",
  equipment: "Equipment",
  fee: "Fee",
  discount: "Discount",
  bundle: "Bundle",
};

const TYPE_BADGE: Record<PricebookItemType, string> = {
  service: "bg-cyan-50 text-cyan-700 border-cyan-200",
  labor: "bg-blue-50 text-blue-700 border-blue-200",
  material: "bg-amber-50 text-amber-700 border-amber-200",
  equipment: "bg-violet-50 text-violet-700 border-violet-200",
  fee: "bg-slate-100 text-slate-600 border-slate-200",
  discount: "bg-emerald-50 text-emerald-700 border-emerald-200",
  bundle: "bg-rose-50 text-rose-700 border-rose-200",
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100
  );
}

/** Dollars string from a form input → integer cents (display-layer only; the server re-validates). */
function dollarsToCents(input: string): number {
  const parsed = Number.parseFloat(input);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(Number((parsed * 100).toFixed(4)));
}

// ─── Item form modal ──────────────────────────────────────────────────────────

interface ItemFormModalProps {
  item: PricebookItem | null; // null = create
  categories: PricebookCategory[];
  canViewCosts: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function ItemFormModal({ item, categories, canViewCosts, onClose, onSaved }: ItemFormModalProps) {
  const isEdit = item !== null;
  const [name, setName] = useState(item?.name ?? "");
  const [itemType, setItemType] = useState<PricebookItemType>(item?.item_type ?? "service");
  const [categoryId, setCategoryId] = useState(item?.category_id ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [defaultQuantity, setDefaultQuantity] = useState(String(item?.default_quantity ?? 1));
  const [priceDollars, setPriceDollars] = useState(
    item ? (item.customer_price / 100).toFixed(2) : ""
  );
  const [costDollars, setCostDollars] = useState(
    item?.internal_cost !== undefined ? (item.internal_cost / 100).toFixed(2) : ""
  );
  const [taxable, setTaxable] = useState(item?.taxable ?? true);
  const [taxCategory, setTaxCategory] = useState(item?.tax_category ?? "");
  const [vendorReference, setVendorReference] = useState(item?.vendor_reference ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name,
      item_type: itemType,
      category_id: categoryId === "" ? (isEdit ? null : undefined) : categoryId,
      description: description || undefined,
      unit: unit || undefined,
      default_quantity: Number.parseFloat(defaultQuantity) || 1,
      customer_price: dollarsToCents(priceDollars),
      taxable,
      tax_category: taxCategory || undefined,
      vendor_reference: vendorReference || undefined,
      notes: notes || undefined,
    };
    if (canViewCosts) payload.internal_cost = dollarsToCents(costDollars);
    if (isEdit) payload.version = item.version;

    try {
      const res = await fetch(isEdit ? `/api/pricebook/items/${item.id}` : "/api/pricebook/items", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string; currentVersion?: number };
      if (!res.ok) {
        setError(
          res.status === 409
            ? json.error ?? "This item was modified by someone else. Reload and try again."
            : json.error ?? "Failed to save item"
        );
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Network error — please try again");
      setSaving(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isEdit || !e.target.files?.[0]) return;
    setImageUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", e.target.files[0]);
    try {
      const res = await fetch(`/api/pricebook/items/${item.id}/image`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setError(json.error ?? "Image upload failed");
    } catch {
      setError("Image upload failed — network error");
    } finally {
      setImageUploading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400";
  const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-slate-900">
            {isEdit ? `Edit ${item.name}` : "New Pricebook Item"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="pb-name" className={labelClass}>Name *</label>
              <input
                id="pb-name"
                type="text"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="pb-type" className={labelClass}>Type</label>
              <select
                id="pb-type"
                value={itemType}
                onChange={(e) => setItemType(e.target.value as PricebookItemType)}
                className={inputClass}
              >
                {PRICEBOOK_ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pb-category" className={labelClass}>Category</label>
              <select
                id="pb-category"
                value={categoryId ?? ""}
                onChange={(e) => setCategoryId(e.target.value)}
                className={inputClass}
              >
                <option value="">— None —</option>
                {categories.filter((c) => !c.archived_at).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="pb-description" className={labelClass}>Description</label>
              <textarea
                id="pb-description"
                rows={2}
                maxLength={5000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="pb-unit" className={labelClass}>Unit</label>
              <input
                id="pb-unit"
                type="text"
                maxLength={40}
                placeholder="each, hour, sq ft…"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="pb-qty" className={labelClass}>Default Quantity</label>
              <input
                id="pb-qty"
                type="number"
                min="0"
                step="0.001"
                value={defaultQuantity}
                onChange={(e) => setDefaultQuantity(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="pb-price" className={labelClass}>Customer Price ($)</label>
              <input
                id="pb-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                className={inputClass}
              />
            </div>

            {canViewCosts && (
              <div>
                <label htmlFor="pb-cost" className={labelClass}>Internal Cost ($)</label>
                <input
                  id="pb-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={costDollars}
                  onChange={(e) => setCostDollars(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-5">
              <input
                id="pb-taxable"
                type="checkbox"
                checked={taxable}
                onChange={(e) => setTaxable(e.target.checked)}
                className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-400"
              />
              <label htmlFor="pb-taxable" className="text-sm font-medium text-slate-700">
                Taxable
              </label>
            </div>

            <div>
              <label htmlFor="pb-tax-category" className={labelClass}>Tax Category</label>
              <input
                id="pb-tax-category"
                type="text"
                maxLength={80}
                value={taxCategory}
                onChange={(e) => setTaxCategory(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="pb-vendor" className={labelClass}>Vendor Reference</label>
              <input
                id="pb-vendor"
                type="text"
                maxLength={200}
                value={vendorReference}
                onChange={(e) => setVendorReference(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="pb-notes" className={labelClass}>Notes (internal)</label>
              <textarea
                id="pb-notes"
                rows={2}
                maxLength={5000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
              />
            </div>

            {isEdit && (
              <div className="sm:col-span-2">
                <label htmlFor="pb-image" className={labelClass}>
                  Image {imageUploading && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                </label>
                <input
                  id="pb-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                  disabled={imageUploading}
                  className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                />
                {item.image_path && (
                  <p className="mt-1 truncate text-xs text-slate-400">Current: {item.image_path}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || name.trim() === ""}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Category manager modal ───────────────────────────────────────────────────

interface CategoryManagerProps {
  categories: PricebookCategory[];
  canArchive: boolean;
  onClose: () => void;
  onChanged: () => void;
}

function CategoryManagerModal({ categories, canArchive, onClose, onChanged }: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (newName.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pricebook/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to create category");
      } else {
        setNewName("");
        onChanged();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveToggle(cat: PricebookCategory) {
    setBusy(true);
    setError(null);
    try {
      const res = cat.archived_at
        ? await fetch(`/api/pricebook/categories/${cat.id}/restore`, { method: "POST" })
        : await fetch(`/api/pricebook/categories/${cat.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setError(json.error ?? "Failed to update category");
      else onChanged();
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-slate-900">Categories</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="mb-4 flex gap-2">
          <input
            type="text"
            maxLength={120}
            placeholder="New category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <button
            type="submit"
            disabled={busy || newName.trim() === ""}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            Add
          </button>
        </form>

        <ul className="divide-y divide-border">
          {categories.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">No categories yet</li>
          )}
          {categories.map((cat) => (
            <li key={cat.id} className="flex items-center justify-between gap-3 py-2.5">
              <span
                className={cn(
                  "text-sm font-medium",
                  cat.archived_at ? "text-slate-400 line-through" : "text-slate-800"
                )}
              >
                {cat.name}
              </span>
              {canArchive && (
                <button
                  type="button"
                  onClick={() => void handleArchiveToggle(cat)}
                  disabled={busy}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                  title={cat.archived_at ? "Restore" : "Archive"}
                >
                  {cat.archived_at ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PricebookPageClient() {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const perms: RolePermissions | undefined = role ? rolePermissions[role] : undefined;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PricebookItemType | "">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const itemsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (typeFilter) params.set("item_type", typeFilter);
    if (categoryFilter) params.set("category_id", categoryFilter);
    if (showArchived) params.set("include_archived", "true");
    const qs = params.toString();
    return `/api/pricebook/items${qs ? `?${qs}` : ""}`;
  }, [debouncedSearch, typeFilter, categoryFilter, showArchived]);

  const items = useApiQuery<PricebookItem[]>(itemsUrl);
  const categories = useApiQuery<PricebookCategory[]>(
    "/api/pricebook/categories?include_archived=true"
  );

  const [formItem, setFormItem] = useState<PricebookItem | null | "new">(null);
  const [showCategories, setShowCategories] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const categoryName = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    [categories.data]
  );

  async function handleArchiveToggle(item: PricebookItem) {
    setBusyId(item.id);
    setActionError(null);
    try {
      const res = item.archived_at
        ? await fetch(`/api/pricebook/items/${item.id}/restore`, { method: "POST" })
        : await fetch(`/api/pricebook/items/${item.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setActionError(json.error ?? "Action failed");
      else items.retry();
    } catch {
      setActionError("Network error — please try again");
    } finally {
      setBusyId(null);
    }
  }

  function handleSaved() {
    setFormItem(null);
    items.retry();
  }

  const rows = items.data ?? [];
  const canViewCosts = perms?.canViewItemCosts ?? false;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: "Pricebook" }]} className="mb-2" />
          <h2 className="font-display text-2xl font-bold text-slate-900">Pricebook</h2>
          <p className="mt-1 text-sm text-slate-500">
            Services, labor, materials, and fees — the catalog estimates and invoices draw from.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {perms?.canExportPricebook && (
            <a
              href="/api/pricebook/export"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          )}
          {perms?.canEditPricebookItems && (
            <button
              type="button"
              onClick={() => setShowCategories(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <FolderCog className="h-4 w-4" />
              Categories
            </button>
          )}
          {perms?.canCreatePricebookItems && (
            <button
              type="button"
              onClick={() => setFormItem("new")}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <Plus className="h-4 w-4" />
              New Item
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as PricebookItemType | "")}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {PRICEBOOK_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {(categories.data ?? [])
            .filter((c) => !c.archived_at)
            .map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
        </select>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-400"
          />
          Show archived
        </label>
      </div>

      {actionError && <ErrorState message={actionError} />}

      {/* Content */}
      {items.error ? (
        <ErrorState message={items.error} onRetry={items.retry} />
      ) : items.loading ? (
        <div className="rounded-xl border border-border bg-white shadow-sm">
          <LoadingRows rows={6} cols={5} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={debouncedSearch || typeFilter || categoryFilter ? "No matching items" : "Pricebook is empty"}
          description={
            debouncedSearch || typeFilter || categoryFilter
              ? "Try clearing the search or filters."
              : "Add your first service, material, or labor rate to start building estimates faster."
          }
          action={
            perms?.canCreatePricebookItems && !(debouncedSearch || typeFilter || categoryFilter) ? (
              <button
                type="button"
                onClick={() => setFormItem("new")}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <Plus className="h-4 w-4" />
                New Item
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  {canViewCosts && <th className="px-4 py-3 text-right">Cost</th>}
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((item) => (
                  <tr key={item.id} className={cn("hover:bg-slate-50", item.archived_at && "opacity-60")}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{item.name}</p>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{item.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block rounded-full border px-2 py-0.5 text-xs font-semibold",
                          TYPE_BADGE[item.item_type]
                        )}
                      >
                        {TYPE_LABELS[item.item_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.category_id ? categoryName.get(item.category_id) ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.unit ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                      {formatPrice(item.customer_price)}
                    </td>
                    {canViewCosts && (
                      <td className="px-4 py-3 text-right font-mono text-slate-500">
                        {item.internal_cost !== undefined ? formatPrice(item.internal_cost) : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {item.archived_at ? (
                        <span className="text-xs font-semibold text-slate-400">Archived</span>
                      ) : item.is_active ? (
                        <span className="text-xs font-semibold text-emerald-600">Active</span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {perms?.canEditPricebookItems && !item.archived_at && (
                          <button
                            type="button"
                            onClick={() => setFormItem(item)}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {perms?.canArchivePricebookItems && (
                          <button
                            type="button"
                            onClick={() => void handleArchiveToggle(item)}
                            disabled={busyId === item.id}
                            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                            title={item.archived_at ? "Restore" : "Archive"}
                          >
                            {item.archived_at ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border border-border bg-white p-4 shadow-sm",
                  item.archived_at && "opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{item.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-block rounded-full border px-2 py-0.5 text-xs font-semibold",
                          TYPE_BADGE[item.item_type]
                        )}
                      >
                        {TYPE_LABELS[item.item_type]}
                      </span>
                      {item.category_id && (
                        <span className="text-xs text-slate-400">
                          {categoryName.get(item.category_id)}
                        </span>
                      )}
                      {item.archived_at && (
                        <span className="text-xs font-semibold text-slate-400">Archived</span>
                      )}
                    </div>
                  </div>
                  <p className="shrink-0 font-mono text-base font-bold text-slate-900">
                    {formatPrice(item.customer_price)}
                  </p>
                </div>
                {canViewCosts && item.internal_cost !== undefined && (
                  <p className="mt-1 text-xs text-slate-400">
                    Cost: <span className="font-mono">{formatPrice(item.internal_cost)}</span>
                  </p>
                )}
                {(perms?.canEditPricebookItems || perms?.canArchivePricebookItems) && (
                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    {perms?.canEditPricebookItems && !item.archived_at && (
                      <button
                        type="button"
                        onClick={() => setFormItem(item)}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                    )}
                    {perms?.canArchivePricebookItems && (
                      <button
                        type="button"
                        onClick={() => void handleArchiveToggle(item)}
                        disabled={busyId === item.id}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                      >
                        {item.archived_at ? (
                          <>
                            <ArchiveRestore className="h-4 w-4" />
                            Restore
                          </>
                        ) : (
                          <>
                            <Archive className="h-4 w-4" />
                            Archive
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modals */}
      {formItem !== null && (
        <ItemFormModal
          item={formItem === "new" ? null : formItem}
          categories={categories.data ?? []}
          canViewCosts={canViewCosts}
          onClose={() => setFormItem(null)}
          onSaved={handleSaved}
        />
      )}
      {showCategories && (
        <CategoryManagerModal
          categories={categories.data ?? []}
          canArchive={perms?.canArchivePricebookItems ?? false}
          onClose={() => setShowCategories(false)}
          onChanged={() => {
            categories.retry();
            items.retry();
          }}
        />
      )}
    </div>
  );
}
