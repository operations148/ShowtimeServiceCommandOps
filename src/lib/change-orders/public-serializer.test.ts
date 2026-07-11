import { describe, it, expect } from "vitest";
import { toPublicChangeOrder, isChangeOrderExpired } from "./public-serializer";
import { ChangeOrderStatus, type ChangeOrder, type ChangeOrderLineItem } from "@/types/change-order";
import type { TenantBranding } from "@/lib/estimates/public-serializer";

const branding: TenantBranding = {
  company_name: "Showtime Pool Service",
  company_logo_url: "https://cdn/logo.png",
  company_phone: "555-0100",
  company_email: "ops@showtime.example",
};

function makeCO(overrides: Partial<ChangeOrder> = {}): ChangeOrder {
  return {
    id: "co-1",
    tenant_id: "tenant-secret-uuid",
    work_order_id: "wo-1",
    change_order_number: "CO-0001",
    status: ChangeOrderStatus.SENT,
    reason: "Additional equipment replacement discovered on site",
    scope_description: "Replace corroded pump housing",
    customer_name: "Jane Doe",
    customer_email: "jane@example.com",
    cost_impact_cents: 40000,
    price_impact_cents: 100000,
    tax_rate: 0.0875,
    tax_impact_cents: 8750,
    total_impact_cents: 108750,
    schedule_impact_days: 2,
    schedule_impact_note: "Adds 2 days to the project timeline",
    blocks_closeout: true,
    internal_notes: "SECRET margin note — do not show customer",
    customer_notes: "This covers the pump replacement we discussed.",
    version: 1,
    created_by: "staff-secret-id",
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:00:00Z",
    ...overrides,
  };
}

function makeLine(overrides: Partial<ChangeOrderLineItem> = {}): ChangeOrderLineItem {
  return {
    id: "line-1",
    change_order_id: "co-1",
    tenant_id: "tenant-secret-uuid",
    sort_order: 0,
    name: "Pump housing replacement",
    description: "OEM replacement housing",
    unit: "each",
    quantity: 1,
    unit_price: 100000,
    unit_cost: 40000,
    taxable: true,
    discount_amount: 0,
    total: 100000,
    source_pricebook_item_id: "pb-item-secret",
    source_pricebook_version: 2,
    created_at: "2026-07-13T00:00:00Z",
    ...overrides,
  };
}

describe("toPublicChangeOrder redaction", () => {
  const pub = toPublicChangeOrder(makeCO(), [makeLine()], branding, new Date("2026-07-15T00:00:00Z"));
  const serialized = JSON.stringify(pub);

  it("never leaks tenant id or staff id", () => {
    expect(serialized).not.toContain("tenant-secret-uuid");
    expect(serialized).not.toContain("staff-secret-id");
  });

  it("never leaks internal notes or cost impact", () => {
    expect(serialized).not.toContain("SECRET margin note");
    expect(pub).not.toHaveProperty("internal_notes");
    expect(pub).not.toHaveProperty("cost_impact_cents");
  });

  it("never leaks line-item cost or pricebook source", () => {
    const line = pub.line_items[0]!;
    expect(line).not.toHaveProperty("unit_cost");
    expect(line).not.toHaveProperty("source_pricebook_item_id");
    expect(serialized).not.toContain("40000"); // the cost value
    expect(serialized).not.toContain("pb-item-secret");
  });

  it("exposes exactly the customer-facing fields including schedule impact", () => {
    expect(pub.change_order_number).toBe("CO-0001");
    expect(pub.total_impact_cents).toBe(108750);
    expect(pub.schedule_impact_days).toBe(2);
    expect(pub.schedule_impact_note).toBe("Adds 2 days to the project timeline");
    expect(pub.line_items[0]!.unit_price).toBe(100000);
  });

  it("sorts line items by sort_order", () => {
    const out = toPublicChangeOrder(
      makeCO(),
      [makeLine({ id: "b", sort_order: 2 }), makeLine({ id: "a", sort_order: 1 })],
      branding
    );
    expect(out.line_items.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("isChangeOrderExpired", () => {
  it("is true past token_expires_at", () => {
    expect(
      isChangeOrderExpired({ status: ChangeOrderStatus.SENT, token_expires_at: "2026-07-01T00:00:00Z" }, new Date("2026-07-15"))
    ).toBe(true);
  });
  it("is false before token_expires_at", () => {
    expect(
      isChangeOrderExpired({ status: ChangeOrderStatus.SENT, token_expires_at: "2026-08-01T00:00:00Z" }, new Date("2026-07-15"))
    ).toBe(false);
  });
  it("is true when already in expired status regardless of date", () => {
    expect(isChangeOrderExpired({ status: ChangeOrderStatus.EXPIRED, token_expires_at: null }, new Date())).toBe(true);
  });
});
