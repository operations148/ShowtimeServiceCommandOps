import { describe, it, expect } from "vitest";
import { csvCell, pricebookToCsv } from "./export-csv";
import type { PricebookItem } from "@/types/pricebook";

function makeItem(overrides: Partial<PricebookItem> = {}): PricebookItem {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    tenant_id: "22222222-2222-2222-2222-222222222222",
    item_type: "material",
    name: "Chlorine tabs",
    default_quantity: 1,
    customer_price: 8999,
    internal_cost: 4250,
    taxable: true,
    is_active: true,
    sort_order: 0,
    version: 1,
    created_at: "2026-07-11T00:00:00Z",
    updated_at: "2026-07-11T00:00:00Z",
    ...overrides,
  };
}

describe("csvCell", () => {
  it("quotes plain values and doubles embedded quotes", () => {
    expect(csvCell("hello")).toBe('"hello"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(42)).toBe('"42"');
    expect(csvCell(null)).toBe('""');
  });

  it("neutralizes formula-injection triggers", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("\"'=SUM(A1:A9)\"");
    expect(csvCell("+1234")).toBe("\"'+1234\"");
    expect(csvCell("-cmd")).toBe("\"'-cmd\"");
    expect(csvCell("@import")).toBe("\"'@import\"");
  });

  it("handles newlines inside quoted cells", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("pricebookToCsv", () => {
  it("includes internal cost only when permitted", () => {
    const withCosts = pricebookToCsv([makeItem()], [], true);
    expect(withCosts).toContain("internal_cost_dollars");
    expect(withCosts).toContain('"42.50"');

    const withoutCosts = pricebookToCsv([makeItem()], [], false);
    expect(withoutCosts).not.toContain("internal_cost_dollars");
    expect(withoutCosts).not.toContain("42.50");
  });

  it("exports prices as dollars with two decimals", () => {
    expect(pricebookToCsv([makeItem()], [], false)).toContain('"89.99"');
  });

  it("resolves category names and marks archived items", () => {
    const csv = pricebookToCsv(
      [makeItem({ category_id: "cat-1", archived_at: "2026-07-11T00:00:00Z", is_active: false })],
      [
        {
          id: "cat-1",
          tenant_id: "22222222-2222-2222-2222-222222222222",
          name: "Chemicals",
          sort_order: 0,
          is_active: true,
          version: 1,
          created_at: "2026-07-11T00:00:00Z",
          updated_at: "2026-07-11T00:00:00Z",
        },
      ],
      false
    );
    expect(csv).toContain('"Chemicals"');
    const dataLine = csv.split("\r\n")[1]!;
    expect(dataLine).toContain('"false"'); // active
    expect(dataLine).toContain('"true"'); // archived
  });

  it("neutralizes a malicious item name end-to-end", () => {
    const csv = pricebookToCsv([makeItem({ name: "=HYPERLINK(\"http://evil\")" })], [], false);
    expect(csv).toContain("'=HYPERLINK");
  });
});
