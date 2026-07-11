import { describe, it, expect } from "vitest";
import { redactEstimateLineCosts, redactEstimateCosts } from "./redact-costs";
import { EstimateStatus, type Estimate, type EstimateLineItem } from "@/types/estimate";

function line(overrides: Partial<EstimateLineItem> = {}): EstimateLineItem {
  return {
    id: "l1",
    estimate_id: "e1",
    tenant_id: "t1",
    sort_order: 0,
    kind: "standard",
    is_selected: true,
    name: "Acid wash",
    quantity: 1,
    unit_price: 45000,
    unit_cost: 18000,
    taxable: true,
    discount_amount: 0,
    markup_percent: 150,
    total: 45000,
    created_at: "2026-07-12T00:00:00Z",
    ...overrides,
  };
}

describe("redactEstimateLineCosts", () => {
  it("drops unit_cost and markup when the role cannot view costs", () => {
    const r = redactEstimateLineCosts(line(), false);
    expect(r).not.toHaveProperty("unit_cost");
    expect(r).not.toHaveProperty("markup_percent");
    expect(r.unit_price).toBe(45000); // customer price stays
  });
  it("keeps costs when permitted", () => {
    const r = redactEstimateLineCosts(line(), true);
    expect(r.unit_cost).toBe(18000);
    expect(r.markup_percent).toBe(150);
  });
});

describe("redactEstimateCosts", () => {
  const estimate: Estimate = {
    id: "e1",
    tenant_id: "t1",
    estimate_number: "EST-0001",
    title: "Job",
    status: EstimateStatus.DRAFT,
    customer_name: "Jane",
    issue_date: "2026-07-12",
    proposal_template: "standard",
    subtotal: 45000,
    tax_rate: 0,
    tax_amount: 0,
    discount_amount: 0,
    total: 45000,
    version: 1,
    terms_acknowledged: false,
    created_at: "2026-07-12T00:00:00Z",
    updated_at: "2026-07-12T00:00:00Z",
    line_items: [line(), line({ id: "l2" })],
  };

  it("redacts every line for cost-blind roles", () => {
    const r = redactEstimateCosts(estimate, false);
    for (const l of r.line_items ?? []) {
      expect(l).not.toHaveProperty("unit_cost");
    }
  });
  it("returns the estimate untouched for cost-permitted roles", () => {
    expect(redactEstimateCosts(estimate, true)).toBe(estimate);
  });
  it("is a no-op when there are no line items loaded", () => {
    const noLines = { ...estimate, line_items: undefined };
    expect(redactEstimateCosts(noLines, false)).toBe(noLines);
  });
});
