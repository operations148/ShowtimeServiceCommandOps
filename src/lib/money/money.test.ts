import { describe, it, expect } from "vitest";
import {
  assertCents,
  assertRate,
  roundHalfUp,
  toCents,
  fromCents,
  formatCents,
  lineSubtotal,
  applyMarkupPercent,
  discountAmountPercent,
  clampDiscount,
  lineTotal,
  taxAmount,
  calcDocumentTotals,
  depositAmount,
  amountDue,
  grossProfit,
  grossMargin,
} from "./money";

describe("assertCents", () => {
  it("accepts non-negative integers", () => {
    expect(assertCents(0)).toBe(0);
    expect(assertCents(1999)).toBe(1999);
  });
  it("rejects negatives, floats, NaN, Infinity", () => {
    expect(() => assertCents(-1)).toThrow(RangeError);
    expect(() => assertCents(19.99)).toThrow(RangeError);
    expect(() => assertCents(NaN)).toThrow(RangeError);
    expect(() => assertCents(Infinity)).toThrow(RangeError);
  });
});

describe("assertRate", () => {
  it("accepts 0, 1, and decimals between", () => {
    expect(assertRate(0)).toBe(0);
    expect(assertRate(0.0875)).toBe(0.0875);
    expect(assertRate(1)).toBe(1);
  });
  it("rejects out-of-range and percent-style values", () => {
    expect(() => assertRate(-0.01)).toThrow(RangeError);
    expect(() => assertRate(8.75)).toThrow(RangeError); // must be 0.0875, not 8.75
  });
});

describe("roundHalfUp", () => {
  it("rounds .5 up", () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(4999.5)).toBe(5000);
  });
  it("rounds below .5 down", () => {
    expect(roundHalfUp(2.4999)).toBe(2);
  });
  it("survives binary float artifacts", () => {
    // 19.99 * 100 === 1998.9999999999998 in IEEE 754
    expect(roundHalfUp(19.99 * 100)).toBe(1999);
    // 1.005 * 100 === 100.49999999999999 — true value is 100.5, must round to 101
    expect(roundHalfUp(1.005 * 100)).toBe(101);
  });
  it("rejects NaN/Infinity", () => {
    expect(() => roundHalfUp(NaN)).toThrow(RangeError);
  });
});

describe("toCents / fromCents / formatCents", () => {
  it("converts dollars to integer cents", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0)).toBe(0);
    expect(toCents(1.005)).toBe(101); // half-up
  });
  it("rejects negative dollars", () => {
    expect(() => toCents(-5)).toThrow(RangeError);
  });
  it("round-trips exactly", () => {
    expect(fromCents(toCents(123.45))).toBe(123.45);
  });
  it("formats USD", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
  });
});

describe("lineSubtotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineSubtotal(2, 1999)).toBe(3998);
  });
  it("handles fractional quantities with one rounding pass", () => {
    expect(lineSubtotal(1.5, 3333)).toBe(5000); // 4999.5 → half-up
    expect(lineSubtotal(0.333, 10000)).toBe(3330);
  });
  it("rejects negative quantity and non-integer price", () => {
    expect(() => lineSubtotal(-1, 100)).toThrow(RangeError);
    expect(() => lineSubtotal(1, 99.5)).toThrow(RangeError);
  });
});

describe("applyMarkupPercent", () => {
  it("applies percent markup to cost", () => {
    expect(applyMarkupPercent(10000, 35)).toBe(13500);
    expect(applyMarkupPercent(10000, 0)).toBe(10000);
  });
  it("rounds half-up on fractional results", () => {
    expect(applyMarkupPercent(999, 33.333)).toBe(1332); // 1331.99667
  });
  it("rejects negative and absurd markups", () => {
    expect(() => applyMarkupPercent(100, -5)).toThrow(RangeError);
    expect(() => applyMarkupPercent(100, 1001)).toThrow(RangeError);
  });
});

describe("discountAmountPercent / clampDiscount", () => {
  it("computes percent discounts", () => {
    expect(discountAmountPercent(10000, 15)).toBe(1500);
    expect(discountAmountPercent(999, 10)).toBe(100); // 99.9 → half-up
  });
  it("clamps discounts to the base", () => {
    expect(clampDiscount(1000, 1500)).toBe(1000);
    expect(clampDiscount(1000, 300)).toBe(300);
  });
  it("rejects percent above 100", () => {
    expect(() => discountAmountPercent(100, 101)).toThrow(RangeError);
  });
});

describe("lineTotal", () => {
  it("applies per-line discount after qty × price", () => {
    expect(lineTotal({ quantity: 2, unit_price: 5000, discount_amount: 1000 })).toBe(9000);
  });
  it("floors at zero when discount exceeds gross", () => {
    expect(lineTotal({ quantity: 1, unit_price: 500, discount_amount: 9999 })).toBe(0);
  });
});

describe("taxAmount", () => {
  it("computes CA-style sales tax", () => {
    expect(taxAmount(10000, 0.0875)).toBe(875);
  });
  it("rounds half-up on sub-cent tax", () => {
    expect(taxAmount(999, 0.0875)).toBe(87); // 87.4125
    expect(taxAmount(1006, 0.0875)).toBe(88); // 88.025
  });
  it("zero rate yields zero tax", () => {
    expect(taxAmount(123456, 0)).toBe(0);
  });
});

describe("calcDocumentTotals", () => {
  it("computes subtotal, tax, total for simple all-taxable lines", () => {
    const t = calcDocumentTotals({
      lines: [
        { quantity: 1, unit_price: 10000 },
        { quantity: 2, unit_price: 2500 },
      ],
      taxRate: 0.0875,
    });
    expect(t.subtotal).toBe(15000);
    expect(t.discount_amount).toBe(0);
    expect(t.taxable_base).toBe(15000);
    expect(t.tax_amount).toBe(1313); // 1312.5 → half-up
    expect(t.total).toBe(16313);
  });

  it("excludes non-taxable lines from the tax base", () => {
    const t = calcDocumentTotals({
      lines: [
        { quantity: 1, unit_price: 10000, taxable: true },
        { quantity: 1, unit_price: 5000, taxable: false }, // e.g. labor in CA
      ],
      taxRate: 0.1,
    });
    expect(t.subtotal).toBe(15000);
    expect(t.taxable_base).toBe(10000);
    expect(t.tax_amount).toBe(1000);
    expect(t.total).toBe(16000);
  });

  it("allocates a document discount to the taxable base proportionally", () => {
    const t = calcDocumentTotals({
      lines: [
        { quantity: 1, unit_price: 10000, taxable: true },
        { quantity: 1, unit_price: 10000, taxable: false },
      ],
      taxRate: 0.1,
      documentDiscountCents: 2000, // taxable share is 50% → 1000 off the taxable base
    });
    expect(t.subtotal).toBe(20000);
    expect(t.discount_amount).toBe(2000);
    expect(t.taxable_base).toBe(9000);
    expect(t.tax_amount).toBe(900);
    expect(t.total).toBe(18900); // 20000 − 2000 + 900
  });

  it("clamps a document discount larger than the subtotal", () => {
    const t = calcDocumentTotals({
      lines: [{ quantity: 1, unit_price: 5000 }],
      taxRate: 0.1,
      documentDiscountCents: 99999,
    });
    expect(t.discount_amount).toBe(5000);
    expect(t.taxable_base).toBe(0);
    expect(t.tax_amount).toBe(0);
    expect(t.total).toBe(0);
  });

  it("handles the empty document", () => {
    const t = calcDocumentTotals({ lines: [] });
    expect(t).toEqual({
      subtotal: 0,
      discount_amount: 0,
      taxable_base: 0,
      tax_amount: 0,
      total: 0,
    });
  });

  it("combines per-line discounts with document discount", () => {
    const t = calcDocumentTotals({
      lines: [{ quantity: 2, unit_price: 5000, discount_amount: 1000 }], // line total 9000
      taxRate: 0.05,
      documentDiscountCents: 1000,
    });
    expect(t.subtotal).toBe(9000);
    expect(t.taxable_base).toBe(8000);
    expect(t.tax_amount).toBe(400);
    expect(t.total).toBe(8400);
  });

  it("never returns a negative total", () => {
    const t = calcDocumentTotals({
      lines: [{ quantity: 1, unit_price: 100, discount_amount: 100 }],
      documentDiscountCents: 500,
    });
    expect(t.total).toBe(0);
  });
});

describe("depositAmount", () => {
  it("computes the 10% deposit", () => {
    expect(depositAmount(45000, 10)).toBe(4500);
  });
  it("rounds half-up on odd totals", () => {
    expect(depositAmount(4995, 10)).toBe(500); // 499.5
    expect(depositAmount(4994, 10)).toBe(499); // 499.4
  });
  it("rejects out-of-range percents", () => {
    expect(() => depositAmount(1000, -1)).toThrow(RangeError);
    expect(() => depositAmount(1000, 101)).toThrow(RangeError);
  });
});

describe("amountDue", () => {
  it("subtracts paid from total", () => {
    expect(amountDue(10000, 4500)).toBe(5500);
  });
  it("floors at zero on overpayment", () => {
    expect(amountDue(10000, 12000)).toBe(0);
  });
});

describe("grossProfit / grossMargin", () => {
  it("computes profit and margin", () => {
    expect(grossProfit(20000, 12000)).toBe(8000);
    expect(grossMargin(20000, 12000)).toBeCloseTo(0.4);
  });
  it("allows negative profit (sold below cost)", () => {
    expect(grossProfit(10000, 15000)).toBe(-5000);
    expect(grossMargin(10000, 15000)).toBeCloseTo(-0.5);
  });
  it("margin is null (undefined), not 0, when revenue is zero", () => {
    expect(grossMargin(0, 5000)).toBeNull();
  });
});
