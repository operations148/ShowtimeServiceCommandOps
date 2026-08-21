import { describe, it, expect } from "vitest";
import {
  type WebhookOutcomeCode,
  ledgerStatusFor,
  httpStatusFor,
  isTerminalLedgerStatus,
} from "./webhook-outcome";

const ALL_CODES: WebhookOutcomeCode[] = [
  "created",
  "already_exists",
  "status_updated",
  "estimate_flagged",
  "ignored_event_type",
  "ignored_non_action_stage",
  "ignored_terminal_status",
  "ignored_no_matching_work_order",
  "rejected_validation",
  "skipped_missing_contact",
  "unknown_tenant",
  "failed_retryable",
];

describe("ledgerStatusFor", () => {
  it("maps every outcome code to a ledger status", () => {
    for (const code of ALL_CODES) {
      expect(ledgerStatusFor(code)).toBeDefined();
    }
  });

  it("records outcomes that did work as done", () => {
    expect(ledgerStatusFor("created")).toBe("done");
    expect(ledgerStatusFor("already_exists")).toBe("done");
    expect(ledgerStatusFor("status_updated")).toBe("done");
    expect(ledgerStatusFor("estimate_flagged")).toBe("done");
  });

  it("does NOT record a skipped or rejected delivery as done", () => {
    // The core regression: these used to be indistinguishable from success
    // because dispatch() returned void and the route marked everything 'done'.
    expect(ledgerStatusFor("rejected_validation")).not.toBe("done");
    expect(ledgerStatusFor("skipped_missing_contact")).not.toBe("done");
    expect(ledgerStatusFor("unknown_tenant")).not.toBe("done");
    expect(ledgerStatusFor("ignored_non_action_stage")).not.toBe("done");
  });

  it("separates permanent input failures from transient ones", () => {
    expect(ledgerStatusFor("rejected_validation")).toBe("failed_permanent");
    expect(ledgerStatusFor("skipped_missing_contact")).toBe("failed_permanent");
    expect(ledgerStatusFor("unknown_tenant")).toBe("failed_permanent");
    expect(ledgerStatusFor("failed_retryable")).toBe("failed_retryable");
  });

  it("marks intentional no-ops as ignored, not failed", () => {
    expect(ledgerStatusFor("ignored_event_type")).toBe("ignored");
    expect(ledgerStatusFor("ignored_non_action_stage")).toBe("ignored");
    expect(ledgerStatusFor("ignored_terminal_status")).toBe("ignored");
    expect(ledgerStatusFor("ignored_no_matching_work_order")).toBe("ignored");
  });
});

describe("httpStatusFor", () => {
  it("returns 200 for anything that reached a correct final state", () => {
    expect(httpStatusFor("created")).toBe(200);
    expect(httpStatusFor("already_exists")).toBe(200);
    expect(httpStatusFor("status_updated")).toBe(200);
    expect(httpStatusFor("estimate_flagged")).toBe(200);
    expect(httpStatusFor("ignored_non_action_stage")).toBe(200);
    expect(httpStatusFor("ignored_terminal_status")).toBe(200);
  });

  it("returns 200 for permanent validation failures — GHL's 4xx retry behavior is unverified", () => {
    // GHL's actual retry policy for the Workflow Custom Webhook action is not
    // reliably documented (checked directly against two official support
    // pages, both silent; third-party sources disagree on 4xx handling).
    // Relying on 422 to mean "don't retry" would be gambling on unverified
    // vendor behavior, so permanent failures are surfaced via outcome_code
    // in the ledger instead — visible to us regardless of what GHL does with
    // the status code.
    expect(httpStatusFor("rejected_validation")).toBe(200);
    expect(httpStatusFor("skipped_missing_contact")).toBe(200);
    expect(httpStatusFor("unknown_tenant")).toBe(200);
  });

  it("returns 500 only for transient failures, which are safe to retry", () => {
    expect(httpStatusFor("failed_retryable")).toBe(500);
  });

  it("never turns an intentional no-op into a 500", () => {
    for (const code of ALL_CODES) {
      if (code === "failed_retryable") continue;
      expect(httpStatusFor(code)).not.toBe(500);
    }
  });

  it("returns a valid HTTP status for every code", () => {
    for (const code of ALL_CODES) {
      const status = httpStatusFor(code);
      expect([200, 500]).toContain(status);
    }
  });
});

describe("isTerminalLedgerStatus", () => {
  it("treats finished states as terminal so exact redelivery is deduped", () => {
    expect(isTerminalLedgerStatus("done")).toBe(true);
    expect(isTerminalLedgerStatus("ignored")).toBe(true);
    expect(isTerminalLedgerStatus("failed_permanent")).toBe(true);
  });

  it("allows a transient failure to be replayed rather than swallowed forever", () => {
    expect(isTerminalLedgerStatus("failed_retryable")).toBe(false);
    expect(isTerminalLedgerStatus("processing")).toBe(false);
    expect(isTerminalLedgerStatus("pending")).toBe(false);
    expect(isTerminalLedgerStatus(null)).toBe(false);
    expect(isTerminalLedgerStatus(undefined)).toBe(false);
  });
});
