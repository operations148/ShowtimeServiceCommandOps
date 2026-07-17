import { describe, it, expect } from "vitest";
import {
  computeRevenue, computeArAging, buildFinancialReport,
  daysBetween, type ReportInvoiceRow, type ReportPaymentRow, type FinancialReportInput,
} from "./financial";
import { InvoiceStatus } from "@/types/invoice";
import type { CostBreakdown } from "@/types/financial-report";

function inv(partial: Partial<ReportInvoiceRow>): ReportInvoiceRow {
  return { status: InvoiceStatus.SENT, total: 0, amount_due: 0, issue_date: "2026-03-10", due_date: null, ...partial };
}

const zeroCost: CostBreakdown = { labor_cents: 0, mileage_cents: 0, expense_cents: 0, total_cost_cents: 0 };

describe("daysBetween", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
    expect(daysBetween("2026-03-31", "2026-03-01")).toBe(-30);
  });
  it("rejects malformed dates", () => {
    expect(() => daysBetween("March 1", "2026-03-01")).toThrow(RangeError);
  });
});

describe("computeRevenue", () => {
  it("separates invoiced, collected, and outstanding", () => {
    const period = [inv({ total: 100000, amount_due: 40000 }), inv({ total: 50000, amount_due: 0 })];
    const open = [inv({ total: 100000, amount_due: 40000 })];
    const payments: ReportPaymentRow[] = [{ kind: "payment", amount: 60000 }, { kind: "payment", amount: 50000 }];
    const r = computeRevenue(period, open, payments);
    expect(r.invoiced_cents).toBe(150000);
    expect(r.collected_cents).toBe(110000);
    expect(r.outstanding_cents).toBe(40000);
    expect(r.written_off_cents).toBe(0);
  });

  it("nets refunds out of collected (banked cash, not gross)", () => {
    const payments: ReportPaymentRow[] = [{ kind: "payment", amount: 100000 }, { kind: "refund", amount: 30000 }];
    const r = computeRevenue([], [], payments);
    expect(r.collected_cents).toBe(70000);
  });

  it("counts void/credited invoices as written-off, not invoiced", () => {
    const period = [
      inv({ total: 100000, status: InvoiceStatus.PAID }),
      inv({ total: 25000, status: InvoiceStatus.VOID }),
      inv({ total: 15000, status: InvoiceStatus.CREDITED }),
    ];
    const r = computeRevenue(period, [], []);
    expect(r.invoiced_cents).toBe(100000);
    expect(r.written_off_cents).toBe(40000);
  });

  it("a credit is not collected cash", () => {
    // credit note zeroes a balance but no money moved — only 'payment'/'refund' touch collected.
    const r = computeRevenue([], [], [{ kind: "credit", amount: 50000 }]);
    expect(r.collected_cents).toBe(0);
  });
});

describe("computeArAging", () => {
  const asOf = "2026-03-31";

  it("buckets by days overdue relative to the report date", () => {
    const open = [
      inv({ amount_due: 10000, due_date: "2026-04-15" }), // future → current
      inv({ amount_due: 20000, due_date: "2026-03-20" }), // 11 days → 1-30
      inv({ amount_due: 30000, due_date: "2026-02-15" }), // 44 days → 31-60
      inv({ amount_due: 40000, due_date: "2026-01-20" }), // 70 days → 61-90
      inv({ amount_due: 50000, due_date: "2025-11-01" }), // 150 days → 90+
    ];
    const a = computeArAging(open, asOf);
    expect(a.current_cents).toBe(10000);
    expect(a.days_1_30_cents).toBe(20000);
    expect(a.days_31_60_cents).toBe(30000);
    expect(a.days_61_90_cents).toBe(40000);
    expect(a.days_90_plus_cents).toBe(50000);
    expect(a.total_outstanding_cents).toBe(150000);
    expect(a.open_invoice_count).toBe(5);
  });

  it("treats a no-due-date balance as current, never as delinquent", () => {
    const a = computeArAging([inv({ amount_due: 10000, due_date: null })], asOf);
    expect(a.current_cents).toBe(10000);
    expect(a.days_90_plus_cents).toBe(0);
  });

  it("ignores invoices with nothing owed", () => {
    const a = computeArAging([inv({ amount_due: 0, due_date: "2026-01-01" })], asOf);
    expect(a.total_outstanding_cents).toBe(0);
    expect(a.open_invoice_count).toBe(0);
  });

  it("a due date exactly on the report date is still current (0 overdue days)", () => {
    const a = computeArAging([inv({ amount_due: 10000, due_date: asOf })], asOf);
    expect(a.current_cents).toBe(10000);
    expect(a.days_1_30_cents).toBe(0);
  });
});

describe("buildFinancialReport", () => {
  function baseInput(over: Partial<FinancialReportInput> = {}): FinancialReportInput {
    return {
      tenantId: "ten1", from: "2026-03-01", to: "2026-03-31", asOf: "2026-03-31",
      periodInvoices: [inv({ total: 100000, amount_due: 40000, status: InvoiceStatus.PARTIALLY_PAID })],
      openInvoices: [inv({ total: 100000, amount_due: 40000, due_date: "2026-03-10" })],
      periodPayments: [{ kind: "payment", amount: 60000 }],
      cost: { labor_cents: 30000, mileage_cents: 5000, expense_cents: 15000, total_cost_cents: 50000 },
      generatedAt: "2026-03-31T12:00:00Z",
      ...over,
    };
  }

  it("derives gross profit and margin from invoiced minus cost", () => {
    const r = buildFinancialReport(baseInput());
    expect(r.gross_profit_cents).toBe(50000);      // 100000 invoiced − 50000 cost
    expect(r.gross_margin).toBeCloseTo(0.5, 6);
  });

  it("reports a NEGATIVE margin when cost exceeds what was invoiced", () => {
    const r = buildFinancialReport(baseInput({
      cost: { labor_cents: 120000, mileage_cents: 0, expense_cents: 0, total_cost_cents: 120000 },
    }));
    expect(r.gross_profit_cents).toBe(-20000);
    expect(r.gross_margin).toBeLessThan(0);
  });

  it("margin is NULL (not 0) with nothing invoiced, and says so in caveats", () => {
    const r = buildFinancialReport(baseInput({ periodInvoices: [], periodPayments: [], cost: zeroCost }));
    expect(r.gross_margin).toBeNull();
    expect(r.caveats.some((c) => /undefined rather than 0/.test(c))).toBe(true);
  });

  it("warns when revenue exists but no costs are logged (the 100%-margin trap)", () => {
    const r = buildFinancialReport(baseInput({ cost: zeroCost }));
    expect(r.gross_margin).toBe(1); // 100% — technically true, practically a lie
    expect(r.caveats.some((c) => /No job costs/.test(c))).toBe(true);
  });

  it("always includes the period-matching caveat", () => {
    const r = buildFinancialReport(baseInput());
    expect(r.caveats.some((c) => /per-job margin/.test(c))).toBe(true);
  });

  it("counts issued invoices, payments, and refunds", () => {
    const r = buildFinancialReport(baseInput({
      periodInvoices: [
        inv({ total: 100000, status: InvoiceStatus.PAID }),
        inv({ total: 10000, status: InvoiceStatus.VOID }),
      ],
      periodPayments: [{ kind: "payment", amount: 50000 }, { kind: "refund", amount: 5000 }],
    }));
    expect(r.counts.invoices_issued).toBe(1); // void excluded
    expect(r.counts.payments_received).toBe(1);
    expect(r.counts.refunds_issued).toBe(1);
  });
});
