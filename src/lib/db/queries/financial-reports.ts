import { db } from "@/lib/db/client";
import { InvoiceStatus } from "@/types/invoice";
import type { CostBreakdown } from "@/types/financial-report";
import {
  buildFinancialReport, type ReportInvoiceRow, type ReportPaymentRow,
} from "@/lib/reports/financial";
import type { FinancialReport } from "@/types/financial-report";

// Statuses that still carry a collectable balance (open receivables).
const OPEN_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.SENT, InvoiceStatus.VIEWED, InvoiceStatus.DEPOSIT_DUE,
  InvoiceStatus.DEPOSIT_PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE,
];

/**
 * Assemble a tenant financial report for [from, to] (inclusive, YYYY-MM-DD).
 * Reads are all tenant-scoped. The heavy lifting is pure (buildFinancialReport);
 * this layer only fetches the rows.
 */
export async function getFinancialReport(
  tenantId: string, from: string, to: string, asOf?: string
): Promise<FinancialReport> {
  const reportAsOf = asOf ?? to;

  const [periodInvoicesRes, openInvoicesRes, paymentsRes] = await Promise.all([
    // Invoices ISSUED in the period.
    db.from("invoices")
      .select("status, total, amount_due, issue_date, due_date")
      .eq("tenant_id", tenantId)
      .gte("issue_date", from)
      .lte("issue_date", to),
    // ALL invoices still carrying a balance right now (aging is as-of, not period).
    db.from("invoices")
      .select("status, total, amount_due, issue_date, due_date")
      .eq("tenant_id", tenantId)
      .in("status", OPEN_STATUSES)
      .gt("amount_due", 0),
    // Succeeded ledger rows in the period.
    db.from("payments")
      .select("kind, amount, created_at, status")
      .eq("tenant_id", tenantId)
      .eq("status", "succeeded")
      .gte("created_at", `${from}T00:00:00Z`)
      .lte("created_at", `${to}T23:59:59Z`),
  ]);

  if (periodInvoicesRes.error) throw new Error(`[db] financial report invoices: ${periodInvoicesRes.error.message}`);
  if (openInvoicesRes.error) throw new Error(`[db] financial report open invoices: ${openInvoicesRes.error.message}`);
  if (paymentsRes.error) throw new Error(`[db] financial report payments: ${paymentsRes.error.message}`);

  const periodInvoices = (periodInvoicesRes.data ?? []) as ReportInvoiceRow[];
  const openInvoices = (openInvoicesRes.data ?? []) as ReportInvoiceRow[];
  const periodPayments = ((paymentsRes.data ?? []) as { kind: ReportPaymentRow["kind"]; amount: number }[])
    .map((p) => ({ kind: p.kind, amount: p.amount }));

  const cost = await getPeriodCost(tenantId, from, to);

  return buildFinancialReport({
    tenantId, from, to,
    periodInvoices, openInvoices, periodPayments,
    cost, asOf: reportAsOf,
  });
}

/**
 * Job-cost totals for entries logged in the period. Reads the Phase 9 costing
 * tables directly and sums the frozen per-entry cost — NOT work_orders
 * .actual_cost_cents, because that rollup is a lifetime total per work order and
 * can't be sliced to a date range. Entry-level cost_cents is the right grain.
 */
export async function getPeriodCost(tenantId: string, from: string, to: string): Promise<CostBreakdown> {
  const fromTs = `${from}T00:00:00Z`;
  const toTs = `${to}T23:59:59Z`;

  const [timeRes, mileageRes, expenseRes] = await Promise.all([
    db.from("time_entries").select("cost_cents").eq("tenant_id", tenantId).gte("created_at", fromTs).lte("created_at", toTs),
    db.from("mileage_entries").select("cost_cents").eq("tenant_id", tenantId).gte("created_at", fromTs).lte("created_at", toTs),
    // Expenses are dated by incurred_on (a DATE), not created_at.
    db.from("job_expenses").select("amount_cents").eq("tenant_id", tenantId).gte("incurred_on", from).lte("incurred_on", to),
  ]);

  const sum = (rows: unknown, field: string): number =>
    ((rows as Record<string, number>[]) ?? []).reduce((s, r) => s + (r[field] ?? 0), 0);

  const labor_cents = sum(timeRes.data, "cost_cents");
  const mileage_cents = sum(mileageRes.data, "cost_cents");
  const expense_cents = sum(expenseRes.data, "amount_cents");

  return {
    labor_cents,
    mileage_cents,
    expense_cents,
    total_cost_cents: labor_cents + mileage_cents + expense_cents,
  };
}
