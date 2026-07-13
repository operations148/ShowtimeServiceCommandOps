import { calcDocumentTotals, type DocumentLineInput } from "@/lib/money/money";
import type { ChangeOrderLineItem } from "@/types/change-order";

/**
 * Authoritative change-order totals (Phase 5). Computed server-side from
 * stored line items — never trusted from the client. Simpler than estimate
 * totals (`src/lib/estimates/totals.ts`) because change-order lines have no
 * optional/package selection — every stored line counts.
 */

export interface ChangeOrderTotals {
  /** Sum of line prices (price impact — what the customer owes/is credited). */
  price_impact_cents: number;
  tax_impact_cents: number;
  /** price_impact + tax_impact. */
  total_impact_cents: number;
  /** Sum of line costs (internal — never exposed publicly). */
  cost_impact_cents: number;
}

export function computeChangeOrderTotals(
  lines: ChangeOrderLineItem[],
  taxRate: number
): ChangeOrderTotals {
  const docLines: DocumentLineInput[] = lines.map((l) => ({
    quantity: l.quantity,
    unit_price: l.unit_price,
    discount_amount: l.discount_amount,
    taxable: l.taxable,
  }));

  const priceTotals = calcDocumentTotals({ lines: docLines, taxRate });

  const costImpactCents = lines.reduce((sum, l) => {
    const cost = l.unit_cost ?? 0;
    return sum + Math.round(l.quantity * cost);
  }, 0);

  return {
    price_impact_cents: priceTotals.subtotal - priceTotals.discount_amount,
    tax_impact_cents: priceTotals.tax_amount,
    total_impact_cents: priceTotals.total,
    cost_impact_cents: costImpactCents,
  };
}
