/**
 * Money utilities — the single authoritative place for financial arithmetic.
 *
 * Rules (see docs/architecture/decisions/ADR-0005-money-and-document-numbering.md):
 *   - All monetary amounts are integer cents. Rates (tax, markup, deposit,
 *     discount percent) are the only decimals.
 *   - Rounding is half-up, applied exactly once per derived amount — never
 *     round intermediate values twice.
 *   - Authoritative totals are computed server-side with these functions.
 *     Browser-side math is display-only and never persisted.
 *   - Amounts are non-negative except grossProfit, which may legitimately be
 *     negative (a job sold below cost).
 */

// ─── Guards ───────────────────────────────────────────────────────────────────

/** Throws unless `value` is a finite, non-negative integer (cents). */
export function assertCents(value: number, label = "amount"): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of cents, got ${value}`);
  }
  return value;
}

/** Throws unless `rate` is a finite decimal in [0, 1] (e.g. 0.0875 = 8.75%). */
export function assertRate(rate: number, label = "rate"): number {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError(`${label} must be a decimal between 0 and 1, got ${rate}`);
  }
  return rate;
}

/** Throws unless `quantity` is finite and non-negative (fractional allowed, e.g. 1.5 hours). */
export function assertQuantity(quantity: number, label = "quantity"): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError(`${label} must be a non-negative number, got ${quantity}`);
  }
  return quantity;
}

// ─── Rounding ─────────────────────────────────────────────────────────────────

/**
 * Half-up rounding to an integer, defended against binary-float artifacts:
 * 19.99 * 100 = 1998.9999999999998 must round to 1999, and 144.999999999
 * arising from a true 145.0 must not round down. The toFixed(6) pass snaps
 * the value to 6 decimal places (exact for all realistic money magnitudes)
 * before the final round.
 */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot round non-finite value ${value}`);
  }
  return Math.round(Number(value.toFixed(6)));
}

// ─── Conversions and formatting ───────────────────────────────────────────────

/** Dollars (user input) → integer cents. toCents(19.99) === 1999. */
export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars < 0) {
    throw new RangeError(`dollars must be a non-negative number, got ${dollars}`);
  }
  return roundHalfUp(dollars * 100);
}

/** Integer cents → dollars. Display/serialization only — never do math on the result. */
export function fromCents(cents: number): number {
  assertCents(cents);
  return cents / 100;
}

/** Locale-aware currency string: formatCents(123456) === "$1,234.56". */
export function formatCents(cents: number, currency = "USD", locale = "en-US"): string {
  assertCents(cents);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

// ─── Line-level math ──────────────────────────────────────────────────────────

/** quantity × unit price, rounded once. lineSubtotal(1.5, 3333) === 5000. */
export function lineSubtotal(quantity: number, unitPriceCents: number): number {
  assertQuantity(quantity);
  assertCents(unitPriceCents, "unit_price");
  return roundHalfUp(quantity * unitPriceCents);
}

/** Cost plus markup: applyMarkupPercent(10000, 35) === 13500. Percent is 0–1000 (10x cap). */
export function applyMarkupPercent(costCents: number, markupPercent: number): number {
  assertCents(costCents, "cost");
  if (!Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 1000) {
    throw new RangeError(`markupPercent must be between 0 and 1000, got ${markupPercent}`);
  }
  return roundHalfUp(costCents * (1 + markupPercent / 100));
}

/** Percentage discount as cents: discountAmountPercent(10000, 15) === 1500. */
export function discountAmountPercent(baseCents: number, percent: number): number {
  assertCents(baseCents, "base");
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`discount percent must be between 0 and 100, got ${percent}`);
  }
  return roundHalfUp(baseCents * (percent / 100));
}

/** A discount may never exceed what it discounts. */
export function clampDiscount(baseCents: number, discountCents: number): number {
  assertCents(baseCents, "base");
  assertCents(discountCents, "discount");
  return Math.min(baseCents, discountCents);
}

export interface LineTotalInput {
  quantity: number;
  unit_price: number; // cents
  discount_amount?: number; // cents, per-line, already an amount (not a percent)
}

/** Per-line total: qty × price − line discount, floored at zero. */
export function lineTotal(input: LineTotalInput): number {
  const gross = lineSubtotal(input.quantity, input.unit_price);
  const discount = clampDiscount(gross, input.discount_amount ?? 0);
  return gross - discount;
}

// ─── Tax ──────────────────────────────────────────────────────────────────────

/** Tax on a base amount: taxAmount(10000, 0.0875) === 875. Rate is decimal 0–1. */
export function taxAmount(taxableBaseCents: number, taxRate: number): number {
  assertCents(taxableBaseCents, "taxable base");
  assertRate(taxRate, "tax rate");
  return roundHalfUp(taxableBaseCents * taxRate);
}

// ─── Document totals ──────────────────────────────────────────────────────────

export interface DocumentLineInput {
  quantity: number;
  unit_price: number; // cents
  discount_amount?: number; // cents, per-line
  /** Defaults to true — untaxed lines must opt out explicitly. */
  taxable?: boolean;
}

export interface DocumentTotalsInput {
  lines: DocumentLineInput[];
  /** Decimal 0–1, e.g. 0.0875. Default 0. */
  taxRate?: number;
  /** Document-level discount in cents, applied after per-line discounts. Default 0. */
  documentDiscountCents?: number;
}

export interface DocumentTotals {
  /** Sum of line totals (after per-line discounts), before document discount and tax. */
  subtotal: number;
  /** Document-level discount actually applied (clamped to subtotal). */
  discount_amount: number;
  /** The base tax was computed on (taxable lines minus their proportional share of the document discount). */
  taxable_base: number;
  tax_amount: number;
  /** subtotal − discount + tax. Never negative. */
  total: number;
}

/**
 * Authoritative document totals.
 *
 * Tax is computed on taxable lines only, after discounts: a document-level
 * discount is allocated to the taxable base proportionally to the taxable
 * share of the subtotal (the common US sales-tax treatment — tax is owed on
 * what the customer actually pays for taxable goods).
 */
export function calcDocumentTotals(input: DocumentTotalsInput): DocumentTotals {
  const taxRate = assertRate(input.taxRate ?? 0, "tax rate");

  let subtotal = 0;
  let taxableSubtotal = 0;
  for (const line of input.lines) {
    const total = lineTotal(line);
    subtotal += total;
    if (line.taxable !== false) taxableSubtotal += total;
  }

  const discount = clampDiscount(subtotal, input.documentDiscountCents ?? 0);

  // Allocate the document discount to the taxable base by taxable share.
  const discountOnTaxable =
    subtotal === 0 ? 0 : roundHalfUp((discount * taxableSubtotal) / subtotal);
  const taxableBase = Math.max(0, taxableSubtotal - discountOnTaxable);

  const tax = taxAmount(taxableBase, taxRate);
  const total = subtotal - discount + tax;

  return {
    subtotal,
    discount_amount: discount,
    taxable_base: taxableBase,
    tax_amount: tax,
    total,
  };
}

// ─── Deposit / payments ───────────────────────────────────────────────────────

/** Deposit from a percent of total: depositAmount(45000, 10) === 4500. */
export function depositAmount(totalCents: number, depositPercent: number): number {
  assertCents(totalCents, "total");
  if (!Number.isFinite(depositPercent) || depositPercent < 0 || depositPercent > 100) {
    throw new RangeError(`depositPercent must be between 0 and 100, got ${depositPercent}`);
  }
  return roundHalfUp(totalCents * (depositPercent / 100));
}

/** Remaining balance, floored at zero (overpayment shows as 0 due, not negative). */
export function amountDue(totalCents: number, amountPaidCents: number): number {
  assertCents(totalCents, "total");
  assertCents(amountPaidCents, "amount_paid");
  return Math.max(0, totalCents - amountPaidCents);
}

// ─── Profitability ────────────────────────────────────────────────────────────

/** Revenue − cost. May be negative (sold below cost) — integer cents, no rounding. */
export function grossProfit(revenueCents: number, costCents: number): number {
  assertCents(revenueCents, "revenue");
  assertCents(costCents, "cost");
  return revenueCents - costCents;
}

/**
 * Gross margin as a decimal (0.35 = 35%). Returns null when revenue is zero —
 * margin is undefined, and callers must render that distinctly from 0%.
 */
export function grossMargin(revenueCents: number, costCents: number): number | null {
  assertCents(revenueCents, "revenue");
  assertCents(costCents, "cost");
  if (revenueCents === 0) return null;
  return (revenueCents - costCents) / revenueCents;
}
