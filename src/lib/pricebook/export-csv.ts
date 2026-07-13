import type { PricebookItem, PricebookCategory } from "@/types/pricebook";
import { fromCents } from "@/lib/money/money";

/**
 * Pricebook CSV export (Phase 2). Import is deliberately NOT implemented —
 * parsing untrusted spreadsheets is a bigger attack/correctness surface than
 * this phase can test properly (see ADR-0006).
 *
 * Injection safety: cells beginning with = + - @ or a tab are prefixed with a
 * single quote so Excel/Sheets render them as text instead of executing them
 * as formulas (CSV/formula-injection, OWASP). All cells are quoted and
 * embedded quotes doubled per RFC 4180.
 */

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let s = String(value);
  if (s.length > 0 && FORMULA_TRIGGERS.has(s[0]!)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Serializes items to CSV. internal_cost is included ONLY when
 * `includeCosts` is true — the route derives that from canViewItemCosts,
 * and canExportPricebook alone never implies cost visibility.
 */
export function pricebookToCsv(
  items: PricebookItem[],
  categories: PricebookCategory[],
  includeCosts: boolean
): string {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const headers = [
    "name",
    "type",
    "category",
    "description",
    "unit",
    "default_quantity",
    "customer_price_dollars",
    ...(includeCosts ? ["internal_cost_dollars"] : []),
    "taxable",
    "tax_category",
    "vendor_reference",
    "active",
    "archived",
    "notes",
  ];

  const rows = items.map((item) => {
    const cells = [
      csvCell(item.name),
      csvCell(item.item_type),
      csvCell(item.category_id ? categoryName.get(item.category_id) ?? "" : ""),
      csvCell(item.description ?? ""),
      csvCell(item.unit ?? ""),
      csvCell(item.default_quantity),
      csvCell(fromCents(item.customer_price).toFixed(2)),
      ...(includeCosts ? [csvCell(fromCents(item.internal_cost ?? 0).toFixed(2))] : []),
      csvCell(item.taxable),
      csvCell(item.tax_category ?? ""),
      csvCell(item.vendor_reference ?? ""),
      csvCell(item.is_active),
      csvCell(item.archived_at !== null && item.archived_at !== undefined),
      csvCell(item.notes ?? ""),
    ];
    return cells.join(",");
  });

  return [headers.map(csvCell).join(","), ...rows].join("\r\n") + "\r\n";
}
