import { describe, it, expect } from "vitest";
import { decideClaim, PROCESSING_LEASE_MS, isTerminalLedgerStatus } from "./webhook-outcome";

// Prompt 11 hardening: a 'processing' ledger row needs a lease.
//
// Before this, isTerminalLedgerStatus() alone drove the decision, so ANY
// non-terminal row was replayable — including one a live invocation had
// claimed a second earlier. That allowed two concurrent deliveries of the same
// payload to dispatch the same business logic simultaneously. Treating every
// 'processing' row as permanently owned is equally wrong: a function killed
// mid-flight would strand the event forever.

const NOW = Date.parse("2026-08-21T12:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("decideClaim", () => {
  it("claims a payload never seen before", () => {
    expect(decideClaim(null, NOW)).toBe("fresh");
    expect(decideClaim(undefined, NOW)).toBe("fresh");
  });

  it("short-circuits every terminal status as a duplicate", () => {
    for (const status of ["done", "ignored", "failed_permanent"]) {
      expect(decideClaim({ processing_status: status, received_at: iso(1000) }, NOW))
        .toBe("duplicate_terminal");
    }
  });

  it("does NOT reprocess a claim that is still within its lease", () => {
    // The concurrency-safety case: another invocation is probably still
    // running this exact payload right now.
    const decision = decideClaim(
      { processing_status: "processing", received_at: iso(5_000) },
      NOW,
    );
    expect(decision).toBe("in_flight");
  });

  it("reclaims a processing row once the lease has expired", () => {
    // The stranded-row case: the function that made this claim is dead.
    const decision = decideClaim(
      { processing_status: "processing", received_at: iso(PROCESSING_LEASE_MS + 1_000) },
      NOW,
    );
    expect(decision).toBe("retry_stale");
  });

  it("treats the lease boundary as still in flight, not stale", () => {
    expect(decideClaim(
      { processing_status: "processing", received_at: iso(PROCESSING_LEASE_MS) },
      NOW,
    )).toBe("in_flight");
  });

  it("uses a lease at least as long as the platform function timeout", () => {
    // vercel.json functions run up to 300s; a shorter lease could steal a
    // claim from an invocation that is still legitimately working.
    expect(PROCESSING_LEASE_MS).toBeGreaterThanOrEqual(300_000);
  });

  it("retries a previous transient failure", () => {
    expect(decideClaim(
      { processing_status: "failed_retryable", received_at: iso(1_000) },
      NOW,
    )).toBe("retry_stale");
  });

  it("retries the default 'pending' status", () => {
    expect(decideClaim({ processing_status: "pending", received_at: iso(1_000) }, NOW))
      .toBe("retry_stale");
  });

  it("prefers re-attempting over stranding when the timestamp is unusable", () => {
    // A row we cannot prove is live must not be locked forever; business
    // idempotency absorbs a redundant attempt, but nothing recovers a
    // permanently stuck event.
    expect(decideClaim({ processing_status: "processing", received_at: null }, NOW))
      .toBe("retry_stale");
    expect(decideClaim({ processing_status: "processing", received_at: "not-a-date" }, NOW))
      .toBe("retry_stale");
  });

  it("keeps isTerminalLedgerStatus consistent with decideClaim", () => {
    for (const status of ["done", "ignored", "failed_permanent"]) {
      expect(isTerminalLedgerStatus(status)).toBe(true);
      expect(decideClaim({ processing_status: status, received_at: iso(1) }, NOW))
        .toBe("duplicate_terminal");
    }
    for (const status of ["processing", "failed_retryable", "pending"]) {
      expect(isTerminalLedgerStatus(status)).toBe(false);
      expect(decideClaim({ processing_status: status, received_at: iso(1) }, NOW))
        .not.toBe("duplicate_terminal");
    }
  });
});
