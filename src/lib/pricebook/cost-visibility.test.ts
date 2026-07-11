import { describe, it, expect } from "vitest";
import { redactItemCost, redactItemCosts } from "./cost-visibility";
import type { PricebookItem } from "@/types/pricebook";

function makeItem(overrides: Partial<PricebookItem> = {}): PricebookItem {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenant_id: "22222222-2222-2222-2222-222222222222",
    item_type: "service",
    name: "Filter clean",
    default_quantity: 1,
    customer_price: 15000,
    internal_cost: 6000,
    taxable: true,
    is_active: true,
    sort_order: 0,
    version: 1,
    created_at: "2026-07-11T00:00:00Z",
    updated_at: "2026-07-11T00:00:00Z",
    ...overrides,
  };
}

describe("redactItemCost", () => {
  it("strips internal_cost when the caller cannot view costs", () => {
    const redacted = redactItemCost(makeItem(), false);
    expect(redacted).not.toHaveProperty("internal_cost");
    // Everything else survives
    expect(redacted.customer_price).toBe(15000);
    expect(redacted.name).toBe("Filter clean");
  });

  it("preserves internal_cost when permitted", () => {
    const kept = redactItemCost(makeItem(), true);
    expect(kept.internal_cost).toBe(6000);
  });

  it("does not mutate the original item", () => {
    const item = makeItem();
    redactItemCost(item, false);
    expect(item.internal_cost).toBe(6000);
  });

  it("strips even a zero cost (presence itself is the leak)", () => {
    const redacted = redactItemCost(makeItem({ internal_cost: 0 }), false);
    expect(redacted).not.toHaveProperty("internal_cost");
  });
});

describe("redactItemCosts", () => {
  it("redacts every element of a list", () => {
    const redacted = redactItemCosts([makeItem(), makeItem({ id: "b" })], false);
    for (const item of redacted) {
      expect(item).not.toHaveProperty("internal_cost");
    }
  });

  it("returns the same array untouched when permitted", () => {
    const items = [makeItem()];
    expect(redactItemCosts(items, true)).toBe(items);
  });
});
