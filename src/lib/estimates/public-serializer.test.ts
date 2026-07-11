import { describe, it, expect } from "vitest";
import { toPublicEstimate, isEstimateExpired, type TenantBranding } from "./public-serializer";
import { EstimateStatus, type Estimate, type EstimateLineItem } from "@/types/estimate";

const branding: TenantBranding = {
  company_name: "Showtime Pool Service",
  company_logo_url: "https://cdn/logo.png",
  company_phone: "555-0100",
  company_email: "ops@showtime.example",
};

function makeEstimate(overrides: Partial<Estimate> = {}): Estimate {
  return {
    id: "est-1",
    tenant_id: "tenant-secret-uuid",
    estimate_handoff_id: "handoff-1",
    work_order_id: "wo-1",
    property_id: "prop-1",
    ghl_contact_id: "ghl-contact-secret",
    ghl_opportunity_id: "ghl-opp-secret",
    estimate_number: "EST-0001",
    title: "Pool remodel",
    status: EstimateStatus.SENT,
    customer_name: "Jane Doe",
    customer_email: "jane@example.com",
    customer_phone: "555-1234",
    customer_address: "1 Pool Ln",
    issue_date: "2026-07-11",
    expires_at: "2026-08-11T00:00:00Z",
    assigned_estimator_id: "staff-secret",
    proposal_template: "standard",
    subtotal: 100000,
    tax_rate: 0.0875,
    tax_amount: 8750,
    discount_amount: 0,
    total: 108750,
    internal_notes: "SECRET margin note — do not show customer",
    customer_notes: "Thanks for your business!",
    terms: "50% deposit due on acceptance",
    version: 2,
    sent_version: 2,
    terms_acknowledged: false,
    created_at: "2026-07-11T00:00:00Z",
    updated_at: "2026-07-11T00:00:00Z",
    ...overrides,
  };
}

function makeLine(overrides: Partial<EstimateLineItem> = {}): EstimateLineItem {
  return {
    id: "line-1",
    estimate_id: "est-1",
    tenant_id: "tenant-secret-uuid",
    sort_order: 0,
    kind: "standard",
    is_selected: true,
    name: "Acid wash",
    description: "Full drain and acid wash",
    unit: "each",
    quantity: 1,
    unit_price: 100000,
    unit_cost: 40000, // internal — must NOT leak
    taxable: true,
    tax_category: "services",
    discount_amount: 0,
    markup_percent: 150,
    total: 100000,
    source_pricebook_item_id: "pb-item-secret",
    source_pricebook_version: 3,
    created_at: "2026-07-11T00:00:00Z",
    ...overrides,
  };
}

describe("toPublicEstimate redaction", () => {
  const pub = toPublicEstimate(makeEstimate(), [makeLine()], branding, new Date("2026-07-15T00:00:00Z"));
  const serialized = JSON.stringify(pub);

  it("never leaks tenant id, GHL ids, or estimator", () => {
    expect(serialized).not.toContain("tenant-secret-uuid");
    expect(serialized).not.toContain("ghl-contact-secret");
    expect(serialized).not.toContain("ghl-opp-secret");
    expect(serialized).not.toContain("staff-secret");
  });

  it("never leaks internal notes", () => {
    expect(serialized).not.toContain("SECRET margin note");
    expect(pub).not.toHaveProperty("internal_notes");
  });

  it("never leaks line-item cost, markup, tax_category, or pricebook source", () => {
    const line = pub.line_items[0]!;
    expect(line).not.toHaveProperty("unit_cost");
    expect(line).not.toHaveProperty("markup_percent");
    expect(line).not.toHaveProperty("tax_category");
    expect(line).not.toHaveProperty("source_pricebook_item_id");
    expect(serialized).not.toContain("40000"); // the cost
    expect(serialized).not.toContain("pb-item-secret");
  });

  it("exposes exactly the customer-facing fields", () => {
    expect(pub.estimate_number).toBe("EST-0001");
    expect(pub.customer_name).toBe("Jane Doe");
    expect(pub.total).toBe(108750);
    expect(pub.line_items[0]!.unit_price).toBe(100000);
    expect(pub.company_name).toBe("Showtime Pool Service");
    expect(pub.terms).toBe("50% deposit due on acceptance");
  });

  it("does not expose the customer's own contact details back (already known to them, no need to echo internal snapshot)", () => {
    // customer_email/phone/address are staff snapshot fields, not part of PublicEstimate
    expect(pub).not.toHaveProperty("customer_email");
    expect(pub).not.toHaveProperty("customer_phone");
    expect(pub).not.toHaveProperty("customer_address");
  });

  it("sorts line items by sort_order", () => {
    const out = toPublicEstimate(
      makeEstimate(),
      [makeLine({ id: "b", sort_order: 2 }), makeLine({ id: "a", sort_order: 1 })],
      branding
    );
    expect(out.line_items.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("isEstimateExpired", () => {
  it("is true past expires_at", () => {
    expect(
      isEstimateExpired({ status: EstimateStatus.SENT, expires_at: "2026-07-01T00:00:00Z" }, new Date("2026-07-15"))
    ).toBe(true);
  });
  it("is false before expires_at", () => {
    expect(
      isEstimateExpired({ status: EstimateStatus.SENT, expires_at: "2026-08-01T00:00:00Z" }, new Date("2026-07-15"))
    ).toBe(false);
  });
  it("is true when already in expired status regardless of date", () => {
    expect(isEstimateExpired({ status: EstimateStatus.EXPIRED, expires_at: null }, new Date())).toBe(true);
  });
  it("never expires without an expiry date", () => {
    expect(isEstimateExpired({ status: EstimateStatus.SENT, expires_at: null }, new Date())).toBe(false);
  });
});
