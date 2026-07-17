/**
 * Job costing arithmetic (Phase 9) — pure, server-authoritative, unit-tested.
 *
 * Rules (ADR-0016):
 *   - All money is integer cents; all math goes through src/lib/money/money.ts.
 *     This module adds NO new rounding rules — it composes the existing ones.
 *   - The client NEVER supplies a rate or a cost. It sends minutes/miles/amount;
 *     these functions price them from server-held rates.
 *   - rollupJobCost is a pure function over the entries. work_orders
 *     .actual_cost_cents is a CACHE of it, recomputed absolutely and never
 *     incremented (ADR-0016 §2), so it is always rebuildable and self-healing.
 */

import {
  assertCents,
  assertQuantity,
  roundHalfUp,
  applyMarkupPercent,
  grossProfit,
  grossMargin,
} from "@/lib/money/money";
import type { JobCostBreakdown, JobCostSummary } from "@/types/costing";

export const MAX_MINUTES_PER_ENTRY = 1440; // one day — mirrors the DB CHECK
export const MAX_MILES_PER_ENTRY = 2000;   // mirrors the DB CHECK

// ─── Labor ────────────────────────────────────────────────────────────────────

/** Throws unless minutes is a positive integer within one day (mirrors the DB CHECK). */
export function assertMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_MINUTES_PER_ENTRY) {
    throw new RangeError(`minutes must be an integer in 1..${MAX_MINUTES_PER_ENTRY}, got ${minutes}`);
  }
  return minutes;
}

/** Throws unless miles is positive and within the per-entry cap. */
export function assertMiles(miles: number): number {
  assertQuantity(miles, "miles");
  if (miles <= 0 || miles > MAX_MILES_PER_ENTRY) {
    throw new RangeError(`miles must be in (0, ${MAX_MILES_PER_ENTRY}], got ${miles}`);
  }
  return miles;
}

/**
 * Labor cost for a time entry. Rounded exactly once, at the end — 7 minutes at
 * $50/hr is 583.33…c and must land on 583, not be rounded twice via an
 * intermediate hourly figure.
 */
export function computeLaborCost(minutes: number, hourlyCostCents: number): number {
  assertMinutes(minutes);
  assertCents(hourlyCostCents, "hourlyCostCents");
  return roundHalfUp((minutes / 60) * hourlyCostCents);
}

/** Minutes between two timestamps, for the optional timer path (ADR-0016 §4). */
export function minutesBetween(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new RangeError("started_at and ended_at must be valid timestamps");
  }
  if (end <= start) {
    throw new RangeError("ended_at must be after started_at");
  }
  return assertMinutes(roundHalfUp((end - start) / 60000));
}

/**
 * The rate to freeze onto a time entry: the technician's burdened rate, falling
 * back to the tenant default when the technician has none. The fallback exists
 * so an unconfigured technician doesn't silently cost the business $0/hr —
 * a zero rate would quietly report infinite margin.
 */
export function resolveHourlyCostCents(technicianRateCents: number | null | undefined, tenantDefaultCents: number): number {
  const tech = technicianRateCents ?? 0;
  const resolved = tech > 0 ? tech : tenantDefaultCents;
  return assertCents(resolved, "hourlyCostCents");
}

// ─── Mileage ──────────────────────────────────────────────────────────────────

/** Mileage cost. miles is fractional; the result is integer cents, rounded once. */
export function computeMileageCost(miles: number, rateCentsPerMile: number): number {
  assertMiles(miles);
  assertCents(rateCentsPerMile, "rateCentsPerMile");
  return roundHalfUp(miles * rateCentsPerMile);
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

/**
 * What we could bill for an expense. Non-billable expenses bill nothing — they
 * still COST us (amount_cents always counts toward job cost), they just aren't
 * passed through to the customer.
 */
export function computeBillableAmount(amountCents: number, billable: boolean, markupPercent: number): number {
  assertCents(amountCents, "amountCents");
  if (!billable) return 0;
  return applyMarkupPercent(amountCents, markupPercent);
}

// ─── Rollup ───────────────────────────────────────────────────────────────────

export interface CostEntries {
  time: { minutes: number; cost_cents: number }[];
  mileage: { miles: number; cost_cents: number }[];
  expenses: { amount_cents: number; billable_amount_cents: number }[];
}

/**
 * Pure rollup: the value work_orders.actual_cost_cents caches. Note expenses
 * contribute their COST (amount_cents), never their billable amount — marking
 * an expense billable changes what we charge, not what we paid.
 */
export function rollupJobCost(entries: CostEntries): JobCostBreakdown {
  const labor_cents = entries.time.reduce((sum, e) => sum + assertCents(e.cost_cents, "time.cost_cents"), 0);
  const mileage_cents = entries.mileage.reduce((sum, e) => sum + assertCents(e.cost_cents, "mileage.cost_cents"), 0);
  const expense_cents = entries.expenses.reduce((sum, e) => sum + assertCents(e.amount_cents, "expense.amount_cents"), 0);
  return {
    labor_cents,
    mileage_cents,
    expense_cents,
    total_cost_cents: labor_cents + mileage_cents + expense_cents,
  };
}

/**
 * Full costing summary for a work order. Margin is DERIVED here and never
 * stored — storing it would be a third value to keep in sync with two that
 * already move (ADR-0016). margin_percent is null (not 0) when there's no
 * contract value: margin is undefined, not break-even.
 */
export function summarizeJobCost(
  workOrderId: string,
  contractCents: number,
  entries: CostEntries
): JobCostSummary {
  assertCents(contractCents, "contractCents");
  const breakdown = rollupJobCost(entries);

  const total_minutes = entries.time.reduce((sum, e) => sum + e.minutes, 0);
  // Miles are fractional; snap the sum to 2dp to avoid float drift accumulating
  // across many entries (0.1 + 0.2 style artifacts) in the displayed total.
  const total_miles = Number(entries.mileage.reduce((sum, e) => sum + e.miles, 0).toFixed(2));
  const billable_expense_cents = entries.expenses.reduce(
    (sum, e) => sum + assertCents(e.billable_amount_cents, "expense.billable_amount_cents"),
    0
  );

  return {
    work_order_id: workOrderId,
    ...breakdown,
    contract_cents: contractCents,
    margin_cents: grossProfit(contractCents, breakdown.total_cost_cents),
    margin_percent: grossMargin(contractCents, breakdown.total_cost_cents),
    total_minutes,
    total_miles,
    billable_expense_cents,
    entry_counts: {
      time: entries.time.length,
      mileage: entries.mileage.length,
      expense: entries.expenses.length,
    },
  };
}
