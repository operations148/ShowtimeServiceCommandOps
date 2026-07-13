import { WorkOrderStatus, WORK_ORDER_STATUS_TRANSITIONS } from "@/types/work-order";

/**
 * Work-order state machine helpers (Phase 5, ADR-0010). The authoritative
 * transition table lives in `src/types/work-order.ts` (unchanged location so
 * existing importers keep working); this module adds the predicate helpers
 * the same way `src/lib/estimates/state-machine.ts` does for estimates.
 *
 *   new → assigned | scheduled | estimate_needed | cancelled
 *   assigned → new | scheduled | in_progress | on_hold | estimate_needed | cancelled
 *   scheduled → assigned | in_progress | on_hold | estimate_needed | cancelled
 *   in_progress → completed | on_hold | estimate_needed | needs_follow_up | cancelled
 *   on_hold → assigned | scheduled | in_progress | cancelled
 *   estimate_needed → assigned | in_progress | cancelled
 *   needs_follow_up → assigned | scheduled | in_progress | estimate_needed
 *   completed → needs_follow_up | closed
 *   closed → needs_follow_up (reopen) | archived
 *   cancelled → archived
 *   archived → [] (terminal)
 */

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return WORK_ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses considered "open" / actively worked — used for dashboards and queues. */
export const OPEN_STATUSES: ReadonlySet<WorkOrderStatus> = new Set([
  WorkOrderStatus.NEW,
  WorkOrderStatus.ASSIGNED,
  WorkOrderStatus.SCHEDULED,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ON_HOLD,
  WorkOrderStatus.ESTIMATE_NEEDED,
  WorkOrderStatus.NEEDS_FOLLOW_UP,
]);

/** Terminal statuses — no further transitions possible. */
export const TERMINAL_STATUSES: ReadonlySet<WorkOrderStatus> = new Set([WorkOrderStatus.ARCHIVED]);

/** Statuses a work order can be closed from. */
export const CLOSEABLE_FROM: ReadonlySet<WorkOrderStatus> = new Set([WorkOrderStatus.COMPLETED]);

/** Statuses a work order can be archived from (never straight from an open status). */
export const ARCHIVABLE_FROM: ReadonlySet<WorkOrderStatus> = new Set([
  WorkOrderStatus.CLOSED,
  WorkOrderStatus.CANCELLED,
]);

export function isOpen(status: WorkOrderStatus): boolean {
  return OPEN_STATUSES.has(status);
}

export function isTerminal(status: WorkOrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canClose(status: WorkOrderStatus): boolean {
  return CLOSEABLE_FROM.has(status);
}

export function canArchive(status: WorkOrderStatus): boolean {
  return ARCHIVABLE_FROM.has(status);
}

/** The "reopen" path is always CLOSED -> NEEDS_FOLLOW_UP. */
export function canReopen(status: WorkOrderStatus): boolean {
  return status === WorkOrderStatus.CLOSED;
}

export class InvalidWorkOrderTransitionError extends Error {
  constructor(
    public readonly from: WorkOrderStatus,
    public readonly to: WorkOrderStatus
  ) {
    super(`Invalid work order transition: ${from} → ${to}`);
    this.name = "InvalidWorkOrderTransitionError";
  }
}

export function assertTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidWorkOrderTransitionError(from, to);
  }
}
