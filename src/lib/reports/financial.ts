/**
 * Financial report aggregation (Phase 10) — pure, server-authoritative, tested.
 *
 * Composes existing rails rather than inventing arithmetic: all money math goes
 * through src/lib/money/money.ts (integer cents, ADR-0005), profit/margin reuse
 * grossProfit/grossMargin, and cost comes from the Phase 9 rollup. This module
 * adds NO new rounding rules.
 *
 * Design note on revenue: "revenue" is reported as three separate numbers —
 * invoiced (billed), collected (banked), outstanding (owed) — because
 * conflating them is how a service business convinces itself it's profitable
 * while running out of cash.
 */

import { assertCents, grossProfit, grossMargin } from "@/lib/money/money";
import { InvoiceStatus } from "@/types/invoice";
import type { PaymentKind } from "@/types/invoice";
import type {
  FinancialReport, RevenueBreakdown, CostBreakdown, ArAging,
} from "@/types/financial-report";

// ─── Inputs (raw rows, already tenant- and period-scoped by the query layer) ──

export interface ReportInvoiceRow {
  status: InvoiceStatus;
  total: number;
  amount_due: number;
  issue_date: string;        // YYYY-MM-DD
  due_date?: string | null;  // YYYY-MM-DD
}

export interface ReportPaymentRow {
  kind: PaymentKind;
  amount: number;
  /** Only 'succeeded' payments should reach here; the query layer filters. */
}

export interface FinancialReportInput {
  tenantId: string;
  from: string;
  to: string;
  /** Invoices ISSUED in the period — drives invoiced/written-off. */
  periodInvoices: ReportInvoiceRow[];
  /** ALL invoices carrying a balance right now — drives outstanding + aging. */
  openInvoices: ReportInvoiceRow[];
  /** Succeeded ledger rows in the period. */
  periodPayments: ReportPaymentRow[];
  /** Phase 9 job-cost totals for work delivered in the period. */
  cost: CostBreakdown;
  /** Report date, YYYY-MM-DD — aging is measured against this, not "now". */
  asOf: string;
  generatedAt?: string;
}

// Invoices that represent money we chose not to collect.
const WRITTEN_OFF: InvoiceStatus[] = [InvoiceStatus.VOID, InvoiceStatus.CREDITED];

/** Days between two YYYY-MM-DD dates (b − a). Date-only, so no TZ drift. */
export function daysBetween(a: string, b: string): number {
  const pa = Date.parse(`${a}T00:00:00Z`);
  const pb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) {
    throw new RangeError(`daysBetween expects YYYY-MM-DD, got "${a}" and "${b}"`);
  }
  return Math.round((pb - pa) / 86_400_000);
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

export function computeRevenue(
  periodInvoices: ReportInvoiceRow[],
  openInvoices: ReportInvoiceRow[],
  periodPayments: ReportPaymentRow[]
): RevenueBreakdown {
  let invoiced_cents = 0;
  let written_off_cents = 0;
  for (const inv of periodInvoices) {
    assertCents(inv.total, "invoice.total");
    if (WRITTEN_OFF.includes(inv.status)) written_off_cents += inv.total;
    else invoiced_cents += inv.total;
  }

  // Ledger-true: payments minus refunds. A credit is NOT cash — it never hit
  // the bank — so it belongs to written-off, not to collected.
  let collected_cents = 0;
  for (const p of periodPayments) {
    assertCents(p.amount, "payment.amount");
    if (p.kind === "payment") collected_cents += p.amount;
    else if (p.kind === "refund") collected_cents -= p.amount;
  }

  const outstanding_cents = openInvoices.reduce(
    (sum, inv) => sum + assertCents(inv.amount_due, "invoice.amount_due"), 0
  );

  return { invoiced_cents, collected_cents, outstanding_cents, written_off_cents };
}

// ─── AR aging ─────────────────────────────────────────────────────────────────

export function computeArAging(openInvoices: ReportInvoiceRow[], asOf: string): ArAging {
  const aging: ArAging = {
    current_cents: 0,
    days_1_30_cents: 0,
    days_31_60_cents: 0,
    days_61_90_cents: 0,
    days_90_plus_cents: 0,
    total_outstanding_cents: 0,
    open_invoice_count: 0,
  };

  for (const inv of openInvoices) {
    const due = assertCents(inv.amount_due, "invoice.amount_due");
    if (due <= 0) continue; // nothing owed — not an AR row

    aging.total_outstanding_cents += due;
    aging.open_invoice_count += 1;

    // No due date = nothing is overdue yet. Treating it as 90+ would invent a
    // delinquency the tenant never agreed to.
    if (!inv.due_date) { aging.current_cents += due; continue; }

    const overdueDays = daysBetween(inv.due_date, asOf);
    if (overdueDays <= 0) aging.current_cents += due;
    else if (overdueDays <= 30) aging.days_1_30_cents += due;
    else if (overdueDays <= 60) aging.days_31_60_cents += due;
    else if (overdueDays <= 90) aging.days_61_90_cents += due;
    else aging.days_90_plus_cents += due;
  }

  return aging;
}

// ─── Report ───────────────────────────────────────────────────────────────────

/**
 * Caveats are part of the report, not a footnote we hope someone reads. The
 * period-matching one is real: cost is aggregated over work delivered in the
 * period while invoiced revenue is billed in the period, and a job billed in
 * March can carry February's labor. This is period-level profitability, not
 * per-job matching — per-job margin lives on the work order (Phase 9).
 */
function buildCaveats(input: FinancialReportInput, revenue: RevenueBreakdown, cost: CostBreakdown): string[] {
  const caveats: string[] = [
    "Period profitability: revenue is what was invoiced in this period; cost is what was logged against work in this period. A job billed in one month may carry labor from another — for exact per-job margin, open the work order.",
  ];
  if (cost.total_cost_cents === 0 && revenue.invoiced_cents > 0) {
    caveats.push(
      "No job costs are recorded for this period, so margin reads as 100%. Set technician labor rates and the tenant mileage rate, and log time/mileage/expenses, before treating this as real."
    );
  }
  if (revenue.invoiced_cents === 0) {
    caveats.push("Nothing was invoiced in this period, so margin is undefined rather than 0%.");
  }
  return caveats;
}

export function buildFinancialReport(input: FinancialReportInput): FinancialReport {
  const revenue = computeRevenue(input.periodInvoices, input.openInvoices, input.periodPayments);
  const ar_aging = computeArAging(input.openInvoices, input.asOf);

  const cost: CostBreakdown = {
    labor_cents: assertCents(input.cost.labor_cents, "cost.labor_cents"),
    mileage_cents: assertCents(input.cost.mileage_cents, "cost.mileage_cents"),
    expense_cents: assertCents(input.cost.expense_cents, "cost.expense_cents"),
    total_cost_cents: assertCents(input.cost.total_cost_cents, "cost.total_cost_cents"),
  };

  // grossProfit/grossMargin assert non-negative cents; collected can legitimately
  // go negative in a refund-heavy period, so margin is measured against invoiced.
  const invoicedForMargin = Math.max(0, revenue.invoiced_cents);

  return {
    tenant_id: input.tenantId,
    from: input.from,
    to: input.to,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    revenue,
    cost,
    gross_profit_cents: grossProfit(invoicedForMargin, cost.total_cost_cents),
    gross_margin: grossMargin(invoicedForMargin, cost.total_cost_cents),
    ar_aging,
    counts: {
      invoices_issued: input.periodInvoices.filter((i) => !WRITTEN_OFF.includes(i.status)).length,
      payments_received: input.periodPayments.filter((p) => p.kind === "payment").length,
      refunds_issued: input.periodPayments.filter((p) => p.kind === "refund").length,
    },
    caveats: buildCaveats(input, revenue, cost),
  };
}
