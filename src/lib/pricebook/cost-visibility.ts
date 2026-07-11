import type { PricebookItem } from "@/types/pricebook";

/**
 * Server-side internal-cost redaction (Phase 2).
 *
 * `internal_cost` is business-sensitive (it exposes the tenant's margins) and
 * must never reach a caller whose role lacks `canViewItemCosts` — UI hiding
 * is not authorization. Every API response path that returns pricebook items
 * MUST pass through one of these helpers before serialization.
 */

export function redactItemCost(item: PricebookItem, canViewCosts: boolean): PricebookItem {
  if (canViewCosts) return item;
  // Destructure-and-drop rather than `delete` — returns a new object and
  // never mutates the caller's copy.
  const { internal_cost: _redacted, ...rest } = item;
  void _redacted;
  return rest;
}

export function redactItemCosts(items: PricebookItem[], canViewCosts: boolean): PricebookItem[] {
  if (canViewCosts) return items;
  return items.map((item) => redactItemCost(item, false));
}
