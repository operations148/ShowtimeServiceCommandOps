import { describe, it, expect } from "vitest";
import { createLineItemSnapshot } from "./line-item-snapshot";
import type { PricebookItem } from "@/types/pricebook";

function makeItem(overrides: Partial<PricebookItem> = {}): PricebookItem {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenant_id: "22222222-2222-2222-2222-222222222222",
    item_type: "service",
    name: "Acid wash",
    description: "Full drain and acid wash",
    unit: "each",
    default_quantity: 1,
    customer_price: 45000,
    internal_cost: 18000,
    taxable: true,
    tax_category: "services",
    is_active: true,
    sort_order: 0,
    version: 3,
    created_at: "2026-07-11T00:00:00Z",
    updated_at: "2026-07-11T00:00:00Z",
    ...overrides,
  };
}

describe("createLineItemSnapshot", () => {
  it("copies every field the document needs plus the source pointer", () => {
    const snap = createLineItemSnapshot(makeItem());
    expect(snap).toMatchObject({
      name: "Acid wash",
      description: "Full drain and acid wash",
      unit: "each",
      quantity: 1,
      unit_price: 45000,
      unit_cost: 18000,
      taxable: true,
      tax_category: "services",
      discount_amount: 0,
      total: 45000,
      source_pricebook_item_id: "11111111-1111-1111-1111-111111111111",
      source_pricebook_version: 3,
    });
  });

  it("is immutable after editing the source item — the whole point", () => {
    const item = makeItem();
    const snap = createLineItemSnapshot(item);

    // Simulate a later pricebook edit (price hike + rename + version bump)
    item.customer_price = 99999;
    item.name = "Acid wash (2027 pricing)";
    item.version = 4;

    expect(snap.unit_price).toBe(45000);
    expect(snap.name).toBe("Acid wash");
    expect(snap.source_pricebook_version).toBe(3);
  });

  it("is frozen — direct mutation attempts throw in strict mode", () => {
    const snap = createLineItemSnapshot(makeItem());
    expect(Object.isFrozen(snap)).toBe(true);
    expect(() => {
      (snap as { unit_price: number }).unit_price = 1;
    }).toThrow(TypeError);
  });

  it("applies quantity and price overrides with a computed total", () => {
    const snap = createLineItemSnapshot(makeItem(), { quantity: 2.5, unit_price: 10000 });
    expect(snap.quantity).toBe(2.5);
    expect(snap.unit_price).toBe(10000);
    expect(snap.total).toBe(25000);
  });

  it("clamps a per-line discount to the gross amount", () => {
    const snap = createLineItemSnapshot(makeItem(), { quantity: 1, discount_amount: 99999999 });
    expect(snap.discount_amount).toBe(45000);
    expect(snap.total).toBe(0);
  });

  it("supports cost-plus pricing via markup_percent", () => {
    const snap = createLineItemSnapshot(makeItem(), { markup_percent: 50 });
    expect(snap.unit_price).toBe(27000); // 18000 × 1.5
    expect(snap.markup_percent).toBe(50);
    expect(snap.total).toBe(27000);
  });

  it("rejects unit_price + markup_percent together", () => {
    expect(() =>
      createLineItemSnapshot(makeItem(), { unit_price: 100, markup_percent: 10 })
    ).toThrow(RangeError);
  });

  it("rejects markup pricing when internal_cost was redacted away", () => {
    const redacted = makeItem();
    delete (redacted as Partial<PricebookItem>).internal_cost;
    expect(() => createLineItemSnapshot(redacted, { markup_percent: 10 })).toThrow(RangeError);
  });

  it("records unit_cost 0 (not undefined) when the source item has no cost", () => {
    const snap = createLineItemSnapshot(makeItem({ internal_cost: 0 }));
    expect(snap.unit_cost).toBe(0);
  });
});
