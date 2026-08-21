// route.test.ts — REAL Request/Response HTTP-layer tests for the webhook
// route. Constructs genuine NextRequest objects and invokes the exported
// POST handler directly, asserting on the genuine NextResponse it returns
// (status code, body shape) — not a mocked wrapper around it.
//
// The database layer is mocked (a chainable fake mirroring the Supabase
// query-builder shape), matching this repo's existing convention
// (src/lib/ghl/dispatch.test.ts mocks its dependencies the same way) and
// matching the split established this phase: genuine Postgres constraint/
// schema behavior is proven separately in work-orders.integration.test.ts
// (PGlite, not this file) — this file proves the HTTP layer: auth branching,
// JSON parsing, ledger-status transitions as OBSERVED THROUGH the mocked
// calls, and the exact response shape GHL receives.
//
// Every test uses vi.doMock + vi.resetModules() explicitly, per test — a
// static top-level vi.mock() factory reassigned via a shared `let` did not
// reliably propagate new mock behavior to a freshly re-imported route module
// in this vitest setup (verified directly: 4 of 12 tests silently kept the
// first-registered mock behavior instead of the test's own). This is the
// slower but deterministic form, not a shortcut.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type TableScript = {
  select?: { data: unknown; error: unknown };
  insert?: { error: unknown };
  update?: { error: unknown };
};

function makeDb(scripts: Record<string, TableScript>) {
  const insertCalls: Array<{ table: string; row: unknown }> = [];
  const updateCalls: Array<{ table: string; patch: unknown }> = [];

  const from = (table: string) => {
    const script = scripts[table] ?? {};
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => script.select ?? { data: null, error: null },
      insert: async (row: unknown) => {
        insertCalls.push({ table, row });
        return script.insert ?? { error: null };
      },
      update: (patch: unknown) => {
        updateCalls.push({ table, patch });
        return {
          eq: () => ({
            eq: async () => script.update ?? { error: null },
          }),
        };
      },
    };
    return chain;
  };

  return { from, insertCalls, updateCalls };
}

const SECRET = "test-webhook-secret-value";
const DEFAULT_OUTCOME = { code: "ignored_non_action_stage", detail: "New Lead" };

function freshRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://example.test/api/ghl/webhooks", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

/**
 * Wires both mocked dependencies fresh for one test and returns the route's
 * exported POST handler, plus the db fake so calls can be inspected. Every
 * test calls this itself rather than relying on shared beforeEach state.
 */
async function setup(opts: {
  dbScripts?: Record<string, TableScript>;
  dispatchResult?: unknown;
  dispatchImpl?: () => Promise<unknown>;
} = {}) {
  vi.resetModules();
  const db = makeDb(opts.dbScripts ?? { webhook_events: { select: { data: null, error: null } } });
  const dispatch = opts.dispatchImpl
    ? vi.fn(opts.dispatchImpl)
    : vi.fn().mockResolvedValue(opts.dispatchResult ?? DEFAULT_OUTCOME);

  vi.doMock("@/lib/db/client", () => ({ db }));
  vi.doMock("@/lib/ghl/dispatch", () => ({ dispatch }));

  const route = await import("./route");
  return { POST: route.POST, db, dispatch };
}

beforeEach(() => {
  process.env.GHL_WEBHOOK_SECRET = SECRET;
  vi.stubEnv("NODE_ENV", "test");
});

describe("authentication", () => {
  it("correct Bearer token is authenticated and accepted", async () => {
    const { POST } = await setup();
    const res = await POST(freshRequest('{"type":"OpportunityStatusChange"}', {
      authorization: `Bearer ${SECRET}`,
    }));
    expect(res.status).not.toBe(401);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  it("wrong Bearer token is rejected with 401", async () => {
    const { POST } = await setup();
    const res = await POST(freshRequest("{}", { authorization: "Bearer wrong-value" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("no Bearer token is rejected with 401", async () => {
    const { POST } = await setup();
    const res = await POST(freshRequest("{}"));
    expect(res.status).toBe(401);
  });

  it("never leaks the secret or its length in the response body", async () => {
    const { POST } = await setup();
    const res = await POST(freshRequest("{}", { authorization: "Bearer wrong-value" }));
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(text.toLowerCase()).not.toContain("length");
  });
});

describe("malformed JSON", () => {
  it("returns 400 and never reserves a ledger row for an unparseable body", async () => {
    const { POST, db } = await setup();
    const res = await POST(freshRequest("{not valid json", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(400);
    // The route's own fix (Prompt 9): JSON is parsed BEFORE the ledger insert,
    // so a parse failure must produce zero insert calls — no permanently
    // stuck 'processing' row, unlike the pre-fix behavior this regression-
    // tests against.
    expect(db.insertCalls).toHaveLength(0);
  });
});

describe("unknown event type", () => {
  it("is safe and observable — 200, not an error, dispatch still recorded it", async () => {
    const { POST } = await setup({ dispatchResult: { code: "ignored_event_type", detail: "SomeNewGHLEventType" } });
    const res = await POST(freshRequest('{"type":"SomeNewGHLEventType"}', {
      authorization: `Bearer ${SECRET}`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("ignored_event_type");
  });
});

describe("permanent validation error", () => {
  it("does not produce a pointless-retry status — 200, not 4xx/5xx", async () => {
    const { POST, db } = await setup({
      dispatchResult: { code: "rejected_validation", detail: "missing pipelineStageName" },
    });
    const res = await POST(freshRequest('{"type":"OpportunityStatusChange"}', {
      authorization: `Bearer ${SECRET}`,
    }));
    // Corrected design (this session): GHL's 4xx retry behavior is
    // unverified, so permanent failures do not rely on a non-2xx status —
    // they're visible via outcome_code in the ledger update instead.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe("rejected_validation");
    const ledgerUpdate = db.updateCalls.find((c) => c.table === "webhook_events");
    expect((ledgerUpdate?.patch as { processing_status?: string })?.processing_status).toBe("failed_permanent");
  });
});

describe("database transient error", () => {
  it("dispatch throwing produces a replayable ledger state and a 5xx-class response", async () => {
    const { POST, db } = await setup({
      dispatchImpl: async () => { throw new Error("connection reset"); },
    });
    const res = await POST(freshRequest('{"type":"OpportunityStatusChange"}', {
      authorization: `Bearer ${SECRET}`,
    }));
    expect(res.status).toBe(500);
    const ledgerUpdate = db.updateCalls.find((c) => c.table === "webhook_events");
    expect((ledgerUpdate?.patch as { processing_status?: string })?.processing_status).toBe("failed_retryable");
  });

  it("a failed ledger lookup is treated as retryable, not pressed through", async () => {
    const { POST, dispatch } = await setup({
      dbScripts: { webhook_events: { select: { data: null, error: { message: "connection reset" } } } },
    });
    const res = await POST(freshRequest('{"type":"OpportunityStatusChange"}', {
      authorization: `Bearer ${SECRET}`,
    }));
    expect(res.status).toBe(500);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("duplicate delivery — already finalized", () => {
  it("a row already marked done is short-circuited as a duplicate, dispatch never runs again", async () => {
    const { POST, dispatch } = await setup({
      dbScripts: { webhook_events: { select: { data: { id: "x", processing_status: "done", attempt_count: 1 }, error: null } } },
    });
    const res = await POST(freshRequest('{"type":"OpportunityStatusChange"}', {
      authorization: `Bearer ${SECRET}`,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("a row stuck in 'processing' (stale/interrupted) is NOT treated as a finalized duplicate — recoverable, not permanently stuck", async () => {
    const { POST, dispatch } = await setup({
      dbScripts: { webhook_events: { select: { data: { id: "x", processing_status: "processing", attempt_count: 1 }, error: null } } },
    });
    const res = await POST(freshRequest('{"type":"OpportunityStatusChange"}', {
      authorization: `Bearer ${SECRET}`,
    }));
    // Not short-circuited as a duplicate — dispatch runs, giving a stuck
    // 'processing' row (e.g. from a killed serverless function) a real path
    // to a terminal state on the next delivery, per isTerminalLedgerStatus's
    // documented lease policy (only done/ignored/failed_permanent are terminal).
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });
});

describe("secret not configured in production", () => {
  it("fails closed with 503 rather than skipping verification", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.GHL_WEBHOOK_SECRET;
    const { POST, dispatch } = await setup();
    const res = await POST(freshRequest("{}"));
    expect(res.status).toBe(503);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
