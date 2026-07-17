// Job costing domain types (Phase 9). Mirrors migration 20260717000001.
// All money values are integer cents (see src/lib/money/money.ts).
// Rationale: ADR-0016.

export type ExpenseCategory =
  | "material"
  | "part"
  | "subcontractor"
  | "equipment"
  | "permit"
  | "other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "material", "part", "subcontractor", "equipment", "permit", "other",
];

// ─── Time ─────────────────────────────────────────────────────────────────────

export interface TimeEntry {
  id: string;
  tenant_id: string;
  work_order_id: string;
  visit_id?: string | null;
  technician_id: string;

  /** Canonical quantity (ADR-0016 §4). */
  minutes: number;
  started_at?: string | null;
  ended_at?: string | null;

  /** cents — FROZEN snapshot of the rate at log time. Owner-only. */
  hourly_cost_cents: number;
  /** cents — server-computed. Owner-only. */
  cost_cents: number;

  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Mileage ──────────────────────────────────────────────────────────────────

export interface MileageEntry {
  id: string;
  tenant_id: string;
  work_order_id: string;
  visit_id?: string | null;
  technician_id: string;

  /** The one genuinely fractional quantity; the cost it yields is integer cents. */
  miles: number;
  /** cents — FROZEN snapshot. Owner-only. */
  rate_cents_per_mile: number;
  /** cents — server-computed. Owner-only. */
  cost_cents: number;

  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export interface JobExpense {
  id: string;
  tenant_id: string;
  work_order_id: string;
  visit_id?: string | null;

  category: ExpenseCategory;
  description: string;
  vendor?: string | null;

  /** cents — what we paid. Owner-only. */
  amount_cents: number;
  billable: boolean;
  markup_percent: number;
  /** cents — server-computed = amount + markup when billable. Owner-only. */
  billable_amount_cents: number;

  receipt_path?: string | null;
  incurred_on: string; // YYYY-MM-DD

  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Technician-facing (cost-blind) shapes ───────────────────────────────────
// The ONLY fields a technician may see. Money is STRUCTURALLY ABSENT so it
// cannot leak (ADR-0016 §3) — same discipline as PublicEstimate omitting
// unit_cost. Produced by src/lib/costing/serialize.ts.

export interface TechTimeEntry {
  id: string;
  work_order_id: string;
  visit_id?: string | null;
  technician_id: string;
  minutes: number;
  started_at?: string | null;
  ended_at?: string | null;
  notes?: string | null;
  created_at: string;
  // NO hourly_cost_cents, NO cost_cents
}

export interface TechMileageEntry {
  id: string;
  work_order_id: string;
  visit_id?: string | null;
  technician_id: string;
  miles: number;
  notes?: string | null;
  created_at: string;
  // NO rate_cents_per_mile, NO cost_cents
}

export interface TechJobExpense {
  id: string;
  work_order_id: string;
  visit_id?: string | null;
  category: ExpenseCategory;
  description: string;
  vendor?: string | null;
  receipt_path?: string | null;
  incurred_on: string;
  created_at: string;
  // NO amount_cents, NO markup, NO billable_amount_cents
}

// ─── Costing rollup / summary ────────────────────────────────────────────────

export interface JobCostBreakdown {
  labor_cents: number;
  mileage_cents: number;
  expense_cents: number;
  /** labor + mileage + expenses — what gets written to work_orders.actual_cost_cents */
  total_cost_cents: number;
}

export interface JobCostSummary extends JobCostBreakdown {
  work_order_id: string;

  /** From work_orders.approved_contract_amount_cents (Phase 5). */
  contract_cents: number;
  /** Derived, never stored: contract − total_cost. Negative = losing money. */
  margin_cents: number;
  /**
   * Derived gross margin as a decimal (0.35 = 35%). NULL — not 0 — when there
   * is no contract value to measure against, because margin is then undefined.
   * Callers MUST render null distinctly from 0% (a 0% margin means "sold at
   * exactly cost"; null means "we don't know yet"). Mirrors money.grossMargin.
   */
  margin_percent: number | null;

  total_minutes: number;
  total_miles: number;
  /** Billable expense value the owner MAY choose to invoice (never auto-billed). */
  billable_expense_cents: number;

  entry_counts: {
    time: number;
    mileage: number;
    expense: number;
  };
}
