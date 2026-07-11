import { describe, it, expect } from "vitest";
import { redactChangeOrderLineCosts, redactChangeOrderCosts } from "./redact-costs";
import { ChangeOrderStatus, type ChangeOrder, type ChangeOrderLineItem } from "@/types/change-order";

function line(overrides: Partial<ChangeOrderLineItem> = {}): ChangeOrderLineItem {
  return {
    id: "l1",
    change_order_id: "co1",
    tenant_id: "t1",
    sort_order: 0,
    name: "Pump housing",
    quantity: 1,
    unit_price: 100000,
    unit_cost: 40000,
    taxable: true,
    discount_amount: 0,
    total: 100000,
    created_at: "2026-07-13T00:00:00Z",
    ...overrides,
  };
}

describe("redactChangeOrderLineCosts", () => {
  it("drops unit_cost when the role cannot view costs", () => {
    const r = redactChangeOrderLineCosts(line(), false);
    expect(r).not.toHaveProperty("unit_cost");
    expect(r.unit_price).toBe(100000);
  });
  it("keeps unit_cost when permitted", () => {
    expect(redactChangeOrderLineCosts(line(), true).unit_cost).toBe(40000);
  });
});

describe("redactChangeOrderCosts", () => {
  const co: ChangeOrder = {
    id: "co1",
    tenant_id: "t1",
    work_order_id: "wo1",
    change_order_number: "CO-0001",
    status: ChangeOrderStatus.DRAFT,
    reason: "Extra work",
    customer_name: "Jane",
    cost_impact_cents: 40000,
    price_impact_cents: 100000,
    tax_rate: 0,
    tax_impact_cents: 0,
    total_impact_cents: 100000,
    blocks_closeout: true,
    version: 1,
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:00:00Z",
    line_items: [line(), line({ id: "l2" })],
  };

  it("strips the document-level cost impact and every line's cost", () => {
    const r = redactChangeOrderCosts(co, false);
    expect(r).not.toHaveProperty("cost_impact_cents");
    for (const l of r.line_items ?? []) {
      expect(l).not.toHaveProperty("unit_cost");
    }
  });

  it("returns the change order untouched for cost-permitted roles", () => {
    expect(redactChangeOrderCosts(co, true)).toBe(co);
  });
});
