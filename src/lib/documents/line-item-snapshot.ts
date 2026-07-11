import type { PricebookItem } from "@/types/pricebook";
import { lineTotal, clampDiscount, applyMarkupPercent } from "@/lib/money/money";

/**
 * Line-item snapshot foundation (Phase 2, ADR-0006).
 *
 * Estimates, change orders, and invoices must never change when a pricebook
 * item is later edited or archived. A snapshot copies every field needed to
 * reproduce the line — name, description, unit, quantity, unit price, unit
 * cost, tax behavior, discount, markup, total — plus a pointer back to the
 * source pricebook item AND the version it was taken at, so drift is
 * detectable ("this estimate used v3 pricing; the item is now v7") without
 * ever being applied retroactively.
 *
 * The returned object is deeply frozen: accidental post-snapshot mutation
 * throws in strict mode instead of silently corrupting a financial document.
 */

export interface LineItemSnapshot {
  /** Copied fields — the document renders from these, never from the live item. */
  readonly name: string;
  readonly description: string | null;
  readonly unit: string | null;
  readonly quantity: number;
  /** Cents. */
  readonly unit_price: number;
  /** Cents. Internal — subject to the same canViewItemCosts redaction as the pricebook. */
  readonly unit_cost: number;
  readonly taxable: boolean;
  readonly tax_category: string | null;
  /** Cents, per-line, already clamped to the line's gross amount. */
  readonly discount_amount: number;
  /** Percent (e.g. 35 = 35%) recorded for audit; already reflected in unit_price when applied. */
  readonly markup_percent: number | null;
  /** Cents: quantity × unit_price − discount, floored at zero. */
  readonly total: number;
  /** Source pointer — for drift detection only, never for re-pricing. */
  readonly source_pricebook_item_id: string;
  readonly source_pricebook_version: number;
}

export interface SnapshotOverrides {
  /** Defaults to the item's default_quantity. */
  quantity?: number;
  /** Cents. Defaults to the item's customer_price. */
  unit_price?: number;
  /** Cents, per-line. Default 0. */
  discount_amount?: number;
  /**
   * Percent markup applied to the item's internal_cost to derive unit_price
   * (cost-plus pricing). Mutually exclusive with unit_price.
   */
  markup_percent?: number;
}

export function createLineItemSnapshot(
  item: PricebookItem,
  overrides: SnapshotOverrides = {}
): LineItemSnapshot {
  if (overrides.unit_price !== undefined && overrides.markup_percent !== undefined) {
    throw new RangeError("unit_price and markup_percent are mutually exclusive");
  }
  if (item.internal_cost === undefined && overrides.markup_percent !== undefined) {
    throw new RangeError("markup_percent pricing requires the item's internal_cost");
  }

  const quantity = overrides.quantity ?? item.default_quantity;
  const unitPrice =
    overrides.markup_percent !== undefined
      ? applyMarkupPercent(item.internal_cost as number, overrides.markup_percent)
      : overrides.unit_price ?? item.customer_price;

  const gross = lineTotal({ quantity, unit_price: unitPrice });
  const discount = clampDiscount(gross, overrides.discount_amount ?? 0);

  const snapshot: LineItemSnapshot = {
    name: item.name,
    description: item.description ?? null,
    unit: item.unit ?? null,
    quantity,
    unit_price: unitPrice,
    unit_cost: item.internal_cost ?? 0,
    taxable: item.taxable,
    tax_category: item.tax_category ?? null,
    discount_amount: discount,
    markup_percent: overrides.markup_percent ?? null,
    total: gross - discount,
    source_pricebook_item_id: item.id,
    source_pricebook_version: item.version,
  };

  return Object.freeze(snapshot);
}
