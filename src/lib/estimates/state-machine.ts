import { EstimateStatus } from "@/types/estimate";

/**
 * The one authoritative estimate state machine (Phase 3, ADR-0008).
 * Import and use this everywhere — never hardcode allowed transitions.
 *
 *   draft     → ready | sent | voided
 *   ready     → draft | sent | voided
 *   sent      → viewed | accepted | declined | expired | voided
 *   viewed    → accepted | declined | expired | voided
 *   accepted  → converted | voided        (accepted snapshot is immutable)
 *   declined  → draft | voided            (re-open into a new draft cycle)
 *   expired   → draft | voided            (re-open / re-quote)
 *   converted → []                        (terminal)
 *   voided    → []                        (terminal)
 */
export const ESTIMATE_STATUS_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  [EstimateStatus.DRAFT]: [EstimateStatus.READY, EstimateStatus.SENT, EstimateStatus.VOIDED],
  [EstimateStatus.READY]: [EstimateStatus.DRAFT, EstimateStatus.SENT, EstimateStatus.VOIDED],
  [EstimateStatus.SENT]: [
    EstimateStatus.VIEWED,
    EstimateStatus.ACCEPTED,
    EstimateStatus.DECLINED,
    EstimateStatus.EXPIRED,
    EstimateStatus.VOIDED,
  ],
  [EstimateStatus.VIEWED]: [
    EstimateStatus.ACCEPTED,
    EstimateStatus.DECLINED,
    EstimateStatus.EXPIRED,
    EstimateStatus.VOIDED,
  ],
  [EstimateStatus.ACCEPTED]: [EstimateStatus.CONVERTED, EstimateStatus.VOIDED],
  [EstimateStatus.DECLINED]: [EstimateStatus.DRAFT, EstimateStatus.VOIDED],
  [EstimateStatus.EXPIRED]: [EstimateStatus.DRAFT, EstimateStatus.VOIDED],
  [EstimateStatus.CONVERTED]: [],
  [EstimateStatus.VOIDED]: [],
};

/** Statuses in which the document body/line items may still be edited. */
export const EDITABLE_STATUSES: ReadonlySet<EstimateStatus> = new Set([
  EstimateStatus.DRAFT,
  EstimateStatus.READY,
]);

/** Terminal statuses — no further transitions possible. */
export const TERMINAL_STATUSES: ReadonlySet<EstimateStatus> = new Set([
  EstimateStatus.CONVERTED,
  EstimateStatus.VOIDED,
]);

/** Statuses in which a customer may make an accept/decline decision. */
export const DECIDABLE_STATUSES: ReadonlySet<EstimateStatus> = new Set([
  EstimateStatus.SENT,
  EstimateStatus.VIEWED,
]);

export function canTransition(from: EstimateStatus, to: EstimateStatus): boolean {
  return ESTIMATE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isEditable(status: EstimateStatus): boolean {
  return EDITABLE_STATUSES.has(status);
}

export function isTerminal(status: EstimateStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isDecidable(status: EstimateStatus): boolean {
  return DECIDABLE_STATUSES.has(status);
}

export class InvalidEstimateTransitionError extends Error {
  constructor(
    public readonly from: EstimateStatus,
    public readonly to: EstimateStatus
  ) {
    super(`Invalid estimate transition: ${from} → ${to}`);
    this.name = "InvalidEstimateTransitionError";
  }
}

/** Throws InvalidEstimateTransitionError when the transition is not allowed. */
export function assertTransition(from: EstimateStatus, to: EstimateStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidEstimateTransitionError(from, to);
  }
}
