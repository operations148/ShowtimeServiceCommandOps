import type { ChangeOrder, ChangeOrderLineItem } from "@/types/change-order";

/**
 * Strips internal cost from change-order line items (and the document-level
 * cost_impact) for staff roles without canViewItemCosts — same rail as the
 * pricebook (ADR-0006) and estimates (Phase 3).
 */
export function redactChangeOrderLineCosts(
  line: ChangeOrderLineItem,
  canViewCosts: boolean
): ChangeOrderLineItem {
  if (canViewCosts) return line;
  const { unit_cost: _c, ...rest } = line;
  void _c;
  return rest as ChangeOrderLineItem;
}

export function redactChangeOrderCosts(co: ChangeOrder, canViewCosts: boolean): ChangeOrder {
  if (canViewCosts) return co;
  const { cost_impact_cents: _cost, ...rest } = co;
  void _cost;
  return {
    ...(rest as ChangeOrder),
    line_items: co.line_items?.map((l) => redactChangeOrderLineCosts(l, false)),
  };
}
