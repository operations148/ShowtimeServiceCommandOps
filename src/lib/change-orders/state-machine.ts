import { ChangeOrderStatus } from "@/types/change-order";

/**
 * The one authoritative change-order state machine (Phase 5, ADR-0011).
 * Deliberately mirrors the estimate state machine's shape (ADR-0008) since
 * change orders reuse the same public-approval pattern, minus the
 * ready/converted steps estimates need (a change order never spawns a
 * downstream document — acceptance patches the parent work order directly).
 *
 *   draft    → sent | voided
 *   sent     → viewed | accepted | rejected | expired | voided
 *   viewed   → accepted | rejected | expired | voided
 *   accepted → voided                          (locked; only override reopens)
 *   rejected → draft | voided                  (revise and resend)
 *   expired  → draft | voided                  (re-open / re-quote)
 *   voided   → []                              (terminal)
 */
export const CHANGE_ORDER_STATUS_TRANSITIONS: Record<ChangeOrderStatus, ChangeOrderStatus[]> = {
  [ChangeOrderStatus.DRAFT]: [ChangeOrderStatus.SENT, ChangeOrderStatus.VOIDED],
  [ChangeOrderStatus.SENT]: [
    ChangeOrderStatus.VIEWED,
    ChangeOrderStatus.ACCEPTED,
    ChangeOrderStatus.REJECTED,
    ChangeOrderStatus.EXPIRED,
    ChangeOrderStatus.VOIDED,
  ],
  [ChangeOrderStatus.VIEWED]: [
    ChangeOrderStatus.ACCEPTED,
    ChangeOrderStatus.REJECTED,
    ChangeOrderStatus.EXPIRED,
    ChangeOrderStatus.VOIDED,
  ],
  [ChangeOrderStatus.ACCEPTED]: [ChangeOrderStatus.VOIDED],
  [ChangeOrderStatus.REJECTED]: [ChangeOrderStatus.DRAFT, ChangeOrderStatus.VOIDED],
  [ChangeOrderStatus.EXPIRED]: [ChangeOrderStatus.DRAFT, ChangeOrderStatus.VOIDED],
  [ChangeOrderStatus.VOIDED]: [],
};

export const EDITABLE_STATUSES: ReadonlySet<ChangeOrderStatus> = new Set([ChangeOrderStatus.DRAFT]);

export const TERMINAL_STATUSES: ReadonlySet<ChangeOrderStatus> = new Set([ChangeOrderStatus.VOIDED]);

export const DECIDABLE_STATUSES: ReadonlySet<ChangeOrderStatus> = new Set([
  ChangeOrderStatus.SENT,
  ChangeOrderStatus.VIEWED,
]);

/** "Pending" for the closeout-blocking rule — not yet resolved either way. */
export const PENDING_STATUSES: ReadonlySet<ChangeOrderStatus> = new Set([
  ChangeOrderStatus.DRAFT,
  ChangeOrderStatus.SENT,
  ChangeOrderStatus.VIEWED,
]);

export function canTransition(from: ChangeOrderStatus, to: ChangeOrderStatus): boolean {
  return CHANGE_ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isEditable(status: ChangeOrderStatus): boolean {
  return EDITABLE_STATUSES.has(status);
}

export function isTerminal(status: ChangeOrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isDecidable(status: ChangeOrderStatus): boolean {
  return DECIDABLE_STATUSES.has(status);
}

export function isPending(status: ChangeOrderStatus): boolean {
  return PENDING_STATUSES.has(status);
}

export class InvalidChangeOrderTransitionError extends Error {
  constructor(
    public readonly from: ChangeOrderStatus,
    public readonly to: ChangeOrderStatus
  ) {
    super(`Invalid change order transition: ${from} → ${to}`);
    this.name = "InvalidChangeOrderTransitionError";
  }
}

export function assertTransition(from: ChangeOrderStatus, to: ChangeOrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidChangeOrderTransitionError(from, to);
  }
}
