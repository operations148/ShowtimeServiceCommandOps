import { describe, it, expect } from "vitest";
import {
  computeEstimateTotals,
  selectedLines,
  validateSelections,
  applySelections,
} from "./totals";
import type { EstimateLineItem } from "@/types/estimate";

function line(overrides: Partial<EstimateLineItem>): EstimateLineItem {
  return {
    id: overrides.id ?? "l",
    estimate_id: "e",
    tenant_id: "t",
    sort_order: 0,
    kind: "standard",
    is_selected: true,
    name: "Line",
    quantity: 1,
    unit_price: 10000,
    unit_cost: 0,
    taxable: true,
    discount_amount: 0,
    total: 10000,
    created_at: "2026-07-11T00:00:00Z",
    ...overrides,
  };
}

describe("selectedLines", () => {
  it("always includes standard lines and excludes unselected optional/recommended", () => {
    const lines = [
      line({ id: "std", kind: "standard", is_selected: false }), // still included
      line({ id: "opt-on", kind: "optional", is_selected: true }),
      line({ id: "opt-off", kind: "optional", is_selected: false }),
      line({ id: "rec-off", kind: "recommended", is_selected: false }),
    ];
    expect(selectedLines(lines).map((l) => l.id)).toEqual(["std", "opt-on"]);
  });
});

describe("computeEstimateTotals", () => {
  it("computes from selected lines only, server-side", () => {
    const lines = [
      line({ id: "std", unit_price: 100000, total: 100000 }),
      line({ id: "opt", kind: "optional", is_selected: false, unit_price: 50000, total: 50000 }),
    ];
    const t = computeEstimateTotals(lines, 0.1);
    expect(t.subtotal).toBe(100000); // optional excluded
    expect(t.tax_amount).toBe(10000);
    expect(t.total).toBe(110000);
  });

  it("includes an optional line once selected", () => {
    const lines = [
      line({ id: "std", unit_price: 100000, total: 100000 }),
      line({ id: "opt", kind: "optional", is_selected: true, unit_price: 50000, total: 50000 }),
    ];
    const t = computeEstimateTotals(lines, 0.1);
    expect(t.subtotal).toBe(150000);
    expect(t.total).toBe(165000);
  });

  it("respects per-line taxability", () => {
    const lines = [
      line({ id: "taxed", unit_price: 100000, total: 100000, taxable: true }),
      line({ id: "labor", unit_price: 100000, total: 100000, taxable: false }),
    ];
    const t = computeEstimateTotals(lines, 0.1);
    expect(t.subtotal).toBe(200000);
    expect(t.taxable_base).toBe(100000);
    expect(t.tax_amount).toBe(10000);
  });
});

describe("validateSelections", () => {
  const lines = [
    line({ id: "std", kind: "standard" }),
    line({ id: "a1", kind: "optional", option_group: "heater" }),
    line({ id: "a2", kind: "optional", option_group: "heater" }),
    line({ id: "b1", kind: "recommended" }),
  ];

  it("accepts a valid single-per-group selection", () => {
    const r = validateSelections(lines, ["a1", "b1"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.selectedIds).toEqual(new Set(["a1", "b1"]));
  });

  it("rejects an unknown line id", () => {
    const r = validateSelections(lines, ["does-not-exist"]);
    expect(r.ok).toBe(false);
  });

  it("rejects two selections from the same option group", () => {
    const r = validateSelections(lines, ["a1", "a2"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/heater/);
  });

  it("tolerates selecting a standard line (no-op, not an error)", () => {
    expect(validateSelections(lines, ["std"]).ok).toBe(true);
  });
});

describe("applySelections", () => {
  it("forces standard true and sets optional/recommended from the set", () => {
    const lines = [
      line({ id: "std", kind: "standard", is_selected: false }),
      line({ id: "opt", kind: "optional", is_selected: true }),
      line({ id: "rec", kind: "recommended", is_selected: false }),
    ];
    const applied = applySelections(lines, new Set(["rec"]));
    expect(applied.find((l) => l.id === "std")!.is_selected).toBe(true);
    expect(applied.find((l) => l.id === "opt")!.is_selected).toBe(false);
    expect(applied.find((l) => l.id === "rec")!.is_selected).toBe(true);
  });

  it("does not mutate the input", () => {
    const lines = [line({ id: "opt", kind: "optional", is_selected: true })];
    applySelections(lines, new Set());
    expect(lines[0]!.is_selected).toBe(true);
  });
});
