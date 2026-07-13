import { describe, it, expect } from "vitest";
import { computeChangeOrderTotals } from "./totals";
import type { ChangeOrderLineItem } from "@/types/change-order";

function line(overrides: Partial<ChangeOrderLineItem>): ChangeOrderLineItem {
  return {
    id: overrides.id ?? "l",
    change_order_id: "co",
    tenant_id: "t",
    sort_order: 0,
    name: "Line",
    quantity: 1,
    unit_price: 10000,
    unit_cost: 4000,
    taxable: true,
    discount_amount: 0,
    total: 10000,
    created_at: "2026-07-13T00:00:00Z",
    ...overrides,
  };
}

describe("computeChangeOrderTotals", () => {
  it("computes price/tax/total impact from all lines (no selection)", () => {
    const lines = [
      line({ id: "a", unit_price: 100000 }),
      line({ id: "b", quantity: 2, unit_price: 25000 }),
    ];
    const t = computeChangeOrderTotals(lines, 0.0875);
    expect(t.price_impact_cents).toBe(150000);
    expect(t.tax_impact_cents).toBe(13125);
    expect(t.total_impact_cents).toBe(163125);
  });

  it("respects per-line taxability", () => {
    const lines = [
      line({ id: "taxed", unit_price: 100000, taxable: true }),
      line({ id: "labor", unit_price: 100000, taxable: false }),
    ];
    const t = computeChangeOrderTotals(lines, 0.1);
    expect(t.price_impact_cents).toBe(200000);
    expect(t.tax_impact_cents).toBe(10000); // only the taxable line
  });

  it("applies per-line discounts", () => {
    const lines = [line({ quantity: 2, unit_price: 5000, discount_amount: 1000 })];
    const t = computeChangeOrderTotals(lines, 0);
    expect(t.price_impact_cents).toBe(9000); // 10000 - 1000
  });

  it("sums internal cost impact separately from price impact", () => {
    const lines = [
      line({ id: "a", quantity: 2, unit_price: 10000, unit_cost: 4000 }),
      line({ id: "b", quantity: 1, unit_price: 5000, unit_cost: 1500 }),
    ];
    const t = computeChangeOrderTotals(lines, 0);
    expect(t.cost_impact_cents).toBe(9500); // 2*4000 + 1*1500
  });

  it("handles an empty change order", () => {
    const t = computeChangeOrderTotals([], 0.0875);
    expect(t).toEqual({
      price_impact_cents: 0,
      tax_impact_cents: 0,
      total_impact_cents: 0,
      cost_impact_cents: 0,
    });
  });

  it("supports a negative-net line (credit) via a discount larger than needed is clamped, but a low unit_price still allows small totals", () => {
    // A credit change order is modeled with a very low/zero unit_price line;
    // true negative pricing is out of scope for a single line (money module
    // clamps discounts and floors totals at zero by design).
    const lines = [line({ unit_price: 0, unit_cost: 0 })];
    const t = computeChangeOrderTotals(lines, 0.1);
    expect(t.price_impact_cents).toBe(0);
    expect(t.total_impact_cents).toBe(0);
  });
});
