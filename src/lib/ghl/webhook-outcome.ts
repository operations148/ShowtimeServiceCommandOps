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

/**
 * How long a 'processing' claim is considered live before another delivery
 * may take it over.
 *
 * Vercel's function timeout for this project is 300s, so a claim younger than
 * that may still be genuinely in flight. Anything older cannot be — the
 * function that made it is dead (timeout, crash, or instance teardown) and
 * would otherwise strand the row in 'processing' forever.
 */
export const PROCESSING_LEASE_MS = 300_000;

/** Longest detail string we will ever emit. */
export const MAX_DETAIL_LENGTH = 200;

/**
 * Makes an outcome `detail` safe to write to a log aggregator or the ledger.
 *
 * Most details are fixed reason strings or GHL stage names, which are safe.
 * Two paths are NOT: the webhook route's catch-all wraps `err.message`, and
 * work-order-factory's unique-violation branch embeds the raw Postgres
 * message. A Postgres unique violation reads like
 *   Key (tenant_id, ghl_opportunity_id, ...)=(<uuid>, <oppId>, ...) already exists.
 * so the conflicting VALUES — tenant UUID and GHL opportunity id — end up
 * inside the string. An earlier revision of this file claimed detail was
 * "only ever set from stage names and internal reason strings"; that was
 * wrong, and this function is what makes the claim true.
 *
 * Redacts rather than drops: knowing a unique violation occurred is the
 * operationally useful part, and the identifiers are not.
 */
export function sanitizeDetail(detail: string | null | undefined): string | undefined {
  if (detail === null || detail === undefined) return undefined;
  const redacted = detail
    // Postgres "Key (cols)=(values)" — the values are the leak.
    .replace(/Key \(([^)]*)\)=\([^)]*\)/gi, "Key ($1)=[redacted]")
    // Any UUID (tenant ids, work order ids, property ids).
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "[id]",
    )
    // Long unbroken alphanumeric runs — GHL location/opportunity/contact ids.
    // Stage names ("Diagnosis Booked") and SCREAMING_SNAKE env names are
    // unaffected: neither contains a 20+ character unbroken alphanumeric run.
    .replace(/\b[A-Za-z0-9]{20,}\b/g, "[id]");

  return redacted.length > MAX_DETAIL_LENGTH
    ? `${redacted.slice(0, MAX_DETAIL_LENGTH)}…`
    : redacted;
}

export type ClaimDecision = "fresh" | "duplicate_terminal" | "retry_stale" | "in_flight";

/**
 * Decides what to do with an existing ledger row for the same payload hash.
 *
 *   fresh              — no prior row; claim it.
 *   duplicate_terminal — already finished; short-circuit, do not reprocess.
 *   retry_stale        — a 'processing' claim older than the lease, or a prior
 *                        retryable failure; safe to take over.
 *   in_flight          — a 'processing' claim still within the lease. Another
 *                        invocation likely owns it right now, so this delivery
 *                        must NOT run the business logic concurrently.
 *
 * Splitting 'in_flight' out from 'retry_stale' is the point: treating every
 * 'processing' row as replayable would let two live deliveries of the same
 * payload dispatch at the same time.
 */
export function decideClaim(
  existing: { processing_status?: string | null; received_at?: string | null } | null | undefined,
  now: number = Date.now(),
): ClaimDecision {
  if (!existing) return "fresh";

  const status = existing.processing_status;
  if (isTerminalLedgerStatus(status)) return "duplicate_terminal";

  if (status === "processing") {
    const receivedAt = existing.received_at ? Date.parse(existing.received_at) : NaN;
    // An unparseable/missing timestamp cannot prove the claim is live, and
    // stranding the event forever is worse than a re-attempt that business
    // idempotency will absorb.
    if (Number.isNaN(receivedAt)) return "retry_stale";
    return now - receivedAt > PROCESSING_LEASE_MS ? "retry_stale" : "in_flight";
  }

  // failed_retryable, 'pending', or any unrecognised non-terminal state.
  return "retry_stale";
}
