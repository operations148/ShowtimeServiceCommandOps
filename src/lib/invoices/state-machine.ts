import { InvoiceStatus, INVOICE_STATUS_TRANSITIONS } from "@/types/invoice";

/**
 * The one authoritative invoice state machine (Phase 6). Consolidates the old
 * 5-state deposit model into the full billing lifecycle — the transitions
 * table itself lives in src/types/invoice.ts (INVOICE_STATUS_TRANSITIONS,
 * the same import every pre-Phase-6 call site already uses); this module adds
 * the predicates and the payment/refund status-derivation helpers.
 *
 * DEPOSIT_PAID is a legacy value: pre-Phase-6 rows may hold it, the
 * transitions table bridges it out, and no new code ever sets it.
 */

export const EDITABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  InvoiceStatus.DRAFT,
  InvoiceStatus.READY,
]);

export const TERMINAL_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  InvoiceStatus.VOID,
  InvoiceStatus.REFUNDED,
  InvoiceStatus.CREDITED,
]);

/** Live to the customer with money still owed — the aging/overdue population. */
export const OPEN_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  InvoiceStatus.SENT,
  InvoiceStatus.VIEWED,
  InvoiceStatus.DEPOSIT_DUE,
  InvoiceStatus.DEPOSIT_PAID, // legacy rows still age
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
]);

/** Statuses in which a payment may be recorded against the invoice. */
export const PAYABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  InvoiceStatus.SENT,
  InvoiceStatus.VIEWED,
  InvoiceStatus.DEPOSIT_DUE,
  InvoiceStatus.DEPOSIT_PAID,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
]);

/** Void is for unpaid documents only — once money moved, refund/credit are the paths. */
export const VOIDABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  InvoiceStatus.DRAFT,
  InvoiceStatus.READY,
  InvoiceStatus.SENT,
  InvoiceStatus.VIEWED,
  InvoiceStatus.DEPOSIT_DUE,
  InvoiceStatus.OVERDUE,
]);

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isEditable(status: InvoiceStatus): boolean {
  return EDITABLE_STATUSES.has(status);
}

export function isTerminal(status: InvoiceStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isOpen(status: InvoiceStatus): boolean {
  return OPEN_STATUSES.has(status);
}

export function isPayable(status: InvoiceStatus): boolean {
  return PAYABLE_STATUSES.has(status);
}

export function isVoidable(status: InvoiceStatus): boolean {
  return VOIDABLE_STATUSES.has(status);
}

/**
 * Derives the status an invoice should hold after its ledger changes.
 * Pure — callers pass the post-change aggregates (all integer cents).
 *
 * Net paid = payments − refunds. Credits reduce what's owed, not what's paid.
 *   netPaid ≤ 0 after money ever moved  → REFUNDED (everything returned)
 *   owed ≤ 0 (total − credits)          → CREDITED when credits closed it,
 *                                         PAID when payments closed it
 *   0 < netPaid < owed                  → PARTIALLY_PAID
 *   netPaid = 0, nothing ever moved     → keep the current (delivery) status
 */
export function deriveStatusAfterLedgerChange(
  current: InvoiceStatus,
  totals: {
    total: number
    amountPaid: number     // gross payments recorded
    amountRefunded: number // gross refunds recorded
    creditedAmount: number // credit adjustments applied
  }
): InvoiceStatus {
  const { total, amountPaid, amountRefunded, creditedAmount } = totals;
  const netPaid = amountPaid - amountRefunded;
  const owed = total - creditedAmount;

  if (amountPaid > 0 && netPaid <= 0) return InvoiceStatus.REFUNDED;
  if (netPaid >= owed && owed > 0) return InvoiceStatus.PAID;
  if (owed <= 0 && creditedAmount > 0) return InvoiceStatus.CREDITED;
  if (netPaid > 0) return InvoiceStatus.PARTIALLY_PAID;
  return current;
}

/** Whether an open invoice past its due date should be flagged overdue. */
export function isOverdueEligible(
  status: InvoiceStatus,
  dueDate: string | null | undefined,
  today: string // YYYY-MM-DD
): boolean {
  if (!dueDate) return false;
  if (!OPEN_STATUSES.has(status)) return false;
  if (status === InvoiceStatus.OVERDUE) return false;
  return dueDate < today;
}

export class InvalidInvoiceTransitionError extends Error {
  constructor(
    public readonly from: InvoiceStatus,
    public readonly to: InvoiceStatus
  ) {
    super(`Invalid invoice transition: ${from} → ${to}`);
    this.name = "InvalidInvoiceTransitionError";
  }
}

export function assertTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidInvoiceTransitionError(from, to);
  }
}
