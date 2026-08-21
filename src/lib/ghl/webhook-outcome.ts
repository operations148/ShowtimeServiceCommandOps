// webhook-outcome.ts
//
// A typed result for one inbound GHL webhook delivery.
//
// The bug this exists to prevent: dispatch() used to return void, so the route
// marked webhook_events as 'done' after any call that did not throw. A delivery
// that was rejected for a missing pipeline stage, discarded for an unknown
// tenant, or quietly skipped was recorded identically to one that created a
// work order — and answered HTTP 200 either way. GHL's execution log showed a
// green success for a delivery that did nothing at all, which is exactly why
// the "workflow succeeds but no Work Order appears" symptom went undiagnosed.
//
// Every terminating path now returns one of these codes, and the code alone
// decides both the ledger status and the HTTP status.

export type WebhookOutcomeCode =
  // — did work ————————————————————————————————————————————————
  | "created"
  | "already_exists"
  | "status_updated"
  | "estimate_flagged"
  // — intentionally did nothing, and that is correct ———————————
  | "ignored_event_type"
  | "ignored_non_action_stage"
  | "ignored_terminal_status"
  | "ignored_no_matching_work_order"
  // — did nothing because the caller sent something unusable ————
  | "rejected_validation"
  | "skipped_missing_contact"
  | "unknown_tenant"
  // — did nothing because we failed ————————————————————————————
  | "failed_retryable";

export interface WebhookOutcome {
  code: WebhookOutcomeCode;
  /** Safe, non-PII detail for logs and the ledger (e.g. a stage name). */
  detail?: string;
  /** Present only for outcomes that resolved to a work order. */
  workOrderNumber?: string;
}

/** Coarse bucket persisted to webhook_events.processing_status. */
export type LedgerStatus = "done" | "ignored" | "failed_permanent" | "failed_retryable";

const LEDGER_STATUS: Record<WebhookOutcomeCode, LedgerStatus> = {
  created:                        "done",
  already_exists:                 "done",
  status_updated:                 "done",
  estimate_flagged:               "done",

  ignored_event_type:             "ignored",
  ignored_non_action_stage:       "ignored",
  ignored_terminal_status:        "ignored",
  ignored_no_matching_work_order: "ignored",

  rejected_validation:            "failed_permanent",
  skipped_missing_contact:        "failed_permanent",
  unknown_tenant:                 "failed_permanent",

  failed_retryable:               "failed_retryable",
};

export function ledgerStatusFor(code: WebhookOutcomeCode): LedgerStatus {
  return LEDGER_STATUS[code];
}

/**
 * HTTP status returned to GHL.
 *
 * Deliberately does NOT use 422 for permanent business-validation failures
 * (rejected_validation, skipped_missing_contact, unknown_tenant), despite
 * that being the original design here. GHL's actual retry policy for the
 * Workflow Custom Webhook action — the delivery mechanism this app receives
 * from — is not reliably documented: two official GHL support pages checked
 * directly are silent on retry-count/backoff/4xx-handling, and third-party
 * sources disagree on whether 4xx is retried at all. Relying on 422 being
 * treated as "don't retry" would be gambling on unverified vendor behavior.
 *
 * Only 5xx has real cross-source agreement that it triggers a GHL retry, so
 * that is the only class this returns a non-2xx for. Permanent failures are
 * surfaced through the ledger's outcome_code, not the HTTP status — visible
 * to us, not dependent on GHL interpreting a status code correctly.
 *
 *   200 — the delivery reached a correct final state: real success, a
 *         correct no-op, OR a permanent business-validation failure (a
 *         misconfigured workflow body will never succeed by being retried
 *         with the identical bytes, so there is nothing for GHL to gain by
 *         seeing a failure code — and no verified evidence it would even
 *         suppress a retry if we sent one).
 *   500 — we failed transiently (database or network). Safe for GHL to retry;
 *         the payload-hash ledger plus per-(opportunity, stage) idempotency
 *         make a retry converge on one work order.
 */
export function httpStatusFor(code: WebhookOutcomeCode): number {
  switch (ledgerStatusFor(code)) {
    case "done":
    case "ignored":
    case "failed_permanent":
      return 200;
    case "failed_retryable":
      return 500;
  }
}

/**
 * Whether an already-recorded delivery is finished, so an exact-byte
 * redelivery can be short-circuited.
 *
 * Only terminal states qualify. A previous 'failed_retryable' or a stale
 * 'processing' row must be allowed to run again — otherwise a transient
 * database blip would permanently swallow the event, and an environment-only
 * correction could never be replayed.
 */
export function isTerminalLedgerStatus(status: string | null | undefined): boolean {
  return status === "done" || status === "ignored" || status === "failed_permanent";
}
