import { describe, it, expect } from "vitest";
import { InvoiceStatus, INVOICE_STATUS_TRANSITIONS } from "./invoice";

describe("INVOICE_STATUS_TRANSITIONS", () => {
  it("allows draft to progress to deposit_due or void only", () => {
    expect(INVOICE_STATUS_TRANSITIONS[InvoiceStatus.DRAFT]).toEqual([
      InvoiceStatus.DEPOSIT_DUE,
      InvoiceStatus.VOID,
    ]);
  });

  it("treats void as terminal", () => {
    expect(INVOICE_STATUS_TRANSITIONS[InvoiceStatus.VOID]).toEqual([]);
  });

  it("has an entry for every enum member", () => {
    const values = Object.values(InvoiceStatus);
    for (const status of values) {
      expect(INVOICE_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });
});
