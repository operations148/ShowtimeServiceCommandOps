import type { Estimate, EstimateLineItem } from "@/types/estimate";

/**
 * Strips internal cost/markup from estimate line items for staff roles without
 * canViewItemCosts (same rail as the pricebook — ADR-0006). The public
 * serializer already drops these; this covers the AUTHENTICATED admin API for
 * cost-blind roles like office staff.
 */
export function redactEstimateLineCosts(line: EstimateLineItem, canViewCosts: boolean): EstimateLineItem {
  if (canViewCosts) return line;
  const { unit_cost: _c, markup_percent: _m, ...rest } = line;
  void _c;
  void _m;
  return rest as EstimateLineItem;
}

export function redactEstimateCosts(estimate: Estimate, canViewCosts: boolean): Estimate {
  if (canViewCosts || !estimate.line_items) return estimate;
  return {
    ...estimate,
    line_items: estimate.line_items.map((l) => redactEstimateLineCosts(l, false)),
  };
}
