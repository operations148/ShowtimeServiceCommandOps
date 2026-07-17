// Financial reporting types (Phase 10). All money is integer cents.
//
// Phase 0 found financial reporting "entirely missing — only operational
// reporting exists". It was un-buildable until now: revenue needed Phase 6
// (invoices + payment ledger) and cost needed Phase 9 (job costing). This is
// the first surface that joins them.

/** Revenue is deliberately three different numbers — conflating them is how you lie to yourself. */
export interface RevenueBreakdown {
  /** Billed: sum of non-void invoice totals issued in the period. */
  invoiced_cents: number;
  /** Banked: succeeded payments MINUS refunds in the period (ledger-true). */
  collected_cents: number;
  /** Owed: outstanding balance on open invoices as of the report date. */
  outstanding_cents: number;
  /** Written off: voided/credited invoice value in the period. */
  written_off_cents: number;
}

export interface CostBreakdown {
  labor_cents: number;
  mileage_cents: number;
  expense_cents: number;
  total_cost_cents: number;
}

/**
 * Accounts-receivable aging. Buckets outstanding balance by how long it has
 * been overdue relative to the report date — the single most useful "are we
 * actually getting paid?" view a service business has.
 */
export interface ArAging {
  /** Not yet due (or no due date set). */
  current_cents: number;
  days_1_30_cents: number;
  days_31_60_cents: number;
  days_61_90_cents: number;
  days_90_plus_cents: number;
  total_outstanding_cents: number;
  /** Count of invoices carrying a balance, for context on the amounts. */
  open_invoice_count: number;
}

export interface FinancialReport {
  tenant_id: string;
  /** Inclusive period bounds, YYYY-MM-DD. */
  from: string;
  to: string;
  generated_at: string;

  revenue: RevenueBreakdown;
  cost: CostBreakdown;

  /**
   * invoiced − cost. Negative means the work billed in this period cost more
   * to deliver than it billed.
   */
  gross_profit_cents: number;
  /**
   * Decimal (0.35 = 35%). NULL — not 0 — when nothing was invoiced: margin is
   * undefined, not break-even. Mirrors money.grossMargin and the Phase 9 rule.
   */
  gross_margin: number | null;

  ar_aging: ArAging;

  /** Context so a reader can judge whether the money figures are meaningful. */
  counts: {
    invoices_issued: number;
    payments_received: number;
    refunds_issued: number;
  };

  /**
   * Honest framing of what this report can and cannot claim. Rendered in the
   * UI — a financial report that hides its own assumptions is a liability.
   */
  caveats: string[];
}
