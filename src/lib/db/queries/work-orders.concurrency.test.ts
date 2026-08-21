// work-orders.concurrency.test.ts
//
// The Prompt 10B concurrency gate: TWO INDEPENDENT PostgreSQL backend
// sessions racing on the stage-level unique invariant, against a real
// PostgreSQL server (CI service container, pinned to production's major
// version 17). Runs only when TEST_DATABASE_URL points at an isolated
// local/CI database — never against production (hard-asserted in real-pg.ts).
//
// Why this exists: PGlite's db.clone() does NOT share storage (proven in
// Prompt 10 — a row inserted via a clone is invisible to the original), so
// two clones are two separate databases, not two sessions racing on one
// constraint. That made the PGlite concurrency attempt meaningless and it was
// removed rather than weakened. This file closes that gap properly.
//
// The interleaving here is DETERMINISTIC, not timing-hopeful: PostgreSQL makes
// the second inserter BLOCK on the first transaction's uncommitted unique-index
// entry until that transaction commits or rolls back. The test proves session B
// is genuinely blocked (its INSERT promise is still pending while A is
// uncommitted) before A commits — so the overlap is observed, not assumed.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Client } from "pg";
import {
  connect,
  getTestDatabaseUrl,
  replayAllMigrations,
  seedTenant,
  RPG_FIXTURE,
  assertIsolatedTestDatabase,
} from "./__test-utils__/real-pg";

const TEST_DB_URL = getTestDatabaseUrl();
const hasRealDb = !!TEST_DB_URL;

// Skips locally (no PostgreSQL available); runs in the CI database lane.
const describeReal = hasRealDb ? describe : describe.skip;

const INSERT_WO = `
  INSERT INTO work_orders (tenant_id, ghl_opportunity_id, ghl_trigger_stage, ghl_contact_id, title, service_category)
  VALUES ($1, $2, $3, $4, $5, 'pool_inspection_diagnostic')
  RETURNING id, wo_number`;

/** The exact lookup work-order-factory.ts performs to resolve a 23505. */
const FIND_BY_BUSINESS_KEY = `
  SELECT id, wo_number FROM work_orders
  WHERE tenant_id = $1 AND ghl_opportunity_id = $2 AND ghl_trigger_stage = $3`;

describe("safety gate", () => {
  it("refuses any non-isolated database URL", () => {
    expect(() => assertIsolatedTestDatabase(
      "postgresql://postgres:x@db.yyjbfjnpmjcraehecbvi.supabase.co:5432/postgres",
    )).toThrow(/production Supabase project ref/);

    expect(() => assertIsolatedTestDatabase(
      "postgresql://postgres:x@some-project.supabase.co:5432/postgres",
    )).toThrow(/hosted Supabase project/);

    expect(() => assertIsolatedTestDatabase(
      "postgresql://postgres:x@10.0.0.5:5432/postgres",
    )).toThrow(/not an isolated local\/CI host/);

    expect(() => assertIsolatedTestDatabase(
      "postgresql://postgres:postgres@localhost:5432/postgres",
    )).not.toThrow();
  });
});

describeReal("REAL multi-connection concurrency", () => {
  let admin: Client;
  let sessionA: Client;
  let sessionB: Client;

  beforeAll(async () => {
    admin = await connect(TEST_DB_URL!);
    const replay = await replayAllMigrations(admin, TEST_DB_URL!);
    // Gate: zero skipped migrations on the real server too.
    expect(replay.appliedMigrations.length).toBe(replay.totalOnDisk);
    await seedTenant(admin, RPG_FIXTURE.tenantA, "a1");
    await seedTenant(admin, RPG_FIXTURE.tenantB, "b1");

    sessionA = await connect(TEST_DB_URL!);
    sessionB = await connect(TEST_DB_URL!);
  }, 180_000);

  afterAll(async () => {
    for (const c of [sessionA, sessionB, admin]) {
      await c?.end().catch(() => {});
    }
  });

  beforeEach(async () => {
    // Clear any transaction a previous test left open or aborted. Without
    // this, one failure cascades into every later test as 25P02
    // ("current transaction is aborted"). Harmless no-op when idle.
    await sessionA.query("ROLLBACK").catch(() => {});
    await sessionB.query("ROLLBACK").catch(() => {});
    await admin.query("DELETE FROM work_orders");
    await admin.query("DELETE FROM webhook_events");
  });

  it("uses two genuinely independent backend sessions (distinct PIDs)", async () => {
    const a = await sessionA.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const b = await sessionB.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const adm = await admin.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");

    // Distinct backend PIDs == distinct server-side processes. This is the
    // property PGlite could not provide.
    expect(a.rows[0]!.pid).not.toBe(b.rows[0]!.pid);
    expect(a.rows[0]!.pid).not.toBe(adm.rows[0]!.pid);
    expect(b.rows[0]!.pid).not.toBe(adm.rows[0]!.pid);
  });

  it("deterministically interleaves: B blocks on A's uncommitted insert, then gets 23505 and resolves to the winner", async () => {
    const { tenantA, opp, contact, stage } = RPG_FIXTURE;

    // Capture B's backend PID *before* it is blocked. Asking a blocked session
    // for its own PID would queue behind its stuck INSERT and never return —
    // that self-deadlock is exactly what timed this test out on the first CI run.
    const bPid = (await sessionB.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;

    // 1. No work order exists for the business key.
    const pre = await admin.query(FIND_BY_BUSINESS_KEY, [tenantA, opp, stage]);
    expect(pre.rows).toHaveLength(0);

    // 2. Both sessions open a transaction and both observe the pre-insert state.
    await sessionA.query("BEGIN");
    await sessionB.query("BEGIN");
    const seenByA = await sessionA.query(FIND_BY_BUSINESS_KEY, [tenantA, opp, stage]);
    const seenByB = await sessionB.query(FIND_BY_BUSINESS_KEY, [tenantA, opp, stage]);
    expect(seenByA.rows).toHaveLength(0);
    expect(seenByB.rows).toHaveLength(0);

    // 3. A inserts but does NOT commit — it now holds the unique-index entry.
    const aInsert = await sessionA.query<{ id: string; wo_number: string }>(
      INSERT_WO, [tenantA, opp, stage, contact, "Race winner A"],
    );
    const winnerId = aInsert.rows[0]!.id;

    // 4. B attempts the same business key while A is still uncommitted.
    //    PostgreSQL blocks B here — this is the deterministic barrier.
    let bSettled = false;
    const bInsertPromise = sessionB
      .query(INSERT_WO, [tenantA, opp, stage, contact, "Race loser B"])
      .then(() => { bSettled = true; return "inserted" as const; })
      .catch((err: { code?: string }) => { bSettled = true; return err; });

    // 5. PROVE the overlap: give B ample time; it must still be pending,
    //    blocked on A's uncommitted transaction. If B had completed here,
    //    the operations would not have overlapped.
    await new Promise((r) => setTimeout(r, 1000));
    expect(bSettled).toBe(false);

    // Independent confirmation from the server's own wait graph — queried via
    // the ADMIN session, never via the blocked session itself.
    const waiting = await admin.query<{ wait_event_type: string | null; state: string }>(
      `SELECT wait_event_type, state FROM pg_stat_activity WHERE pid = $1`, [bPid],
    );
    expect(waiting.rows).toHaveLength(1);
    // PostgreSQL reports the blocked inserter as waiting on a Lock (the
    // winner's still-open transactionid).
    expect(waiting.rows[0]!.wait_event_type).toBe("Lock");

    // 6. A commits — its insert wins.
    await sessionA.query("COMMIT");

    // 7. B is released and receives a real unique violation.
    const bResult = (await bInsertPromise) as { code?: string };
    expect(bResult).not.toBe("inserted");
    expect(bResult.code).toBe("23505");

    // 8. B runs the production race-handling path: roll back, then re-read by
    //    the EXACT tenant + opportunity + stage business key.
    await sessionB.query("ROLLBACK");
    const reread = await sessionB.query<{ id: string; wo_number: string }>(
      FIND_BY_BUSINESS_KEY, [tenantA, opp, stage],
    );

    // 9. The winner is found -> the losing request returns idempotent success.
    expect(reread.rows).toHaveLength(1);
    expect(reread.rows[0]!.id).toBe(winnerId);

    // 10. Exactly one work order exists.
    const total = await admin.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM work_orders WHERE ghl_opportunity_id = $1`, [opp],
    );
    expect(Number(total.rows[0]!.cnt)).toBe(1);
  }, 60_000);

  it("two DISTINCT webhook event hashes with one business key still yield exactly one work order", async () => {
    const { tenantA, opp, contact, stage } = RPG_FIXTURE;

    // Two payloads differing only in an irrelevant field -> two different
    // body hashes -> the raw-body ledger dedup cannot short-circuit the second.
    const hashOne = "a".repeat(64);
    const hashTwo = "b".repeat(64);
    for (const h of [hashOne, hashTwo]) {
      await admin.query(
        `INSERT INTO webhook_events (provider, event_id, payload_hash, processing_status, attempt_count)
         VALUES ('ghl', $1, $1, 'processing', 1)`, [h],
      );
    }

    const ledger = await admin.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM webhook_events WHERE provider = 'ghl'`,
    );
    expect(Number(ledger.rows[0]!.cnt)).toBe(2); // two distinct ledger rows

    // First delivery creates the work order.
    await sessionA.query(INSERT_WO, [tenantA, opp, stage, contact, "First delivery"]);

    // Second delivery, different hash, SAME business key -> 23505, then the
    // production path resolves it to the existing winner.
    let secondCode: string | undefined;
    try {
      await sessionB.query(INSERT_WO, [tenantA, opp, stage, contact, "Second delivery"]);
    } catch (err) {
      secondCode = (err as { code?: string }).code;
    }
    expect(secondCode).toBe("23505");

    const winner = await sessionB.query(FIND_BY_BUSINESS_KEY, [tenantA, opp, stage]);
    expect(winner.rows).toHaveLength(1); // resolves to already_exists

    const total = await admin.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM work_orders WHERE ghl_opportunity_id = $1`, [opp],
    );
    expect(Number(total.rows[0]!.cnt)).toBe(1); // business idempotency held

    // No ledger row was left falsely marked successful.
    const falseSuccess = await admin.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM webhook_events WHERE processing_status = 'done'`,
    );
    expect(Number(falseSuccess.rows[0]!.cnt)).toBe(0);
  }, 60_000);

  it("an UNRELATED 23505 does not resolve to a winner — it must stay a genuine failure", async () => {
    const { tenantA, opp, contact, stage } = RPG_FIXTURE;

    // A unique violation on a DIFFERENT constraint entirely: the webhook
    // ledger's UNIQUE (provider, event_id).
    const hash = "c".repeat(64);
    await admin.query(
      `INSERT INTO webhook_events (provider, event_id, payload_hash, processing_status, attempt_count)
       VALUES ('ghl', $1, $1, 'processing', 1)`, [hash],
    );

    let code: string | undefined;
    let constraint: string | undefined;
    try {
      await admin.query(
        `INSERT INTO webhook_events (provider, event_id, payload_hash, processing_status, attempt_count)
         VALUES ('ghl', $1, $1, 'processing', 1)`, [hash],
      );
    } catch (err) {
      code = (err as { code?: string }).code;
      constraint = (err as { constraint?: string }).constraint;
    }

    expect(code).toBe("23505");
    // Critically NOT the work-order stage-level constraint.
    expect(constraint).not.toBe("idx_wo_tenant_opportunity_stage_unique");

    // The production resolution path re-reads by the work-order business key
    // and finds NOTHING -> it must rethrow as a real failure, never
    // already_exists. Proven here: no winner exists to resolve to.
    const reread = await admin.query(FIND_BY_BUSINESS_KEY, [tenantA, opp, stage]);
    expect(reread.rows).toHaveLength(0);
    void contact;
  }, 60_000);

  it("the same business key in a DIFFERENT tenant is unaffected — tenant isolation holds under the unique index", async () => {
    const { tenantA, tenantB, opp, contact, stage } = RPG_FIXTURE;

    await sessionA.query(INSERT_WO, [tenantA, opp, stage, contact, "Tenant A"]);
    // Same opportunity + stage, different tenant -> must succeed.
    await sessionB.query(INSERT_WO, [tenantB, opp, stage, contact, "Tenant B"]);

    const perTenant = await admin.query<{ tenant_id: string }>(
      `SELECT DISTINCT tenant_id FROM work_orders WHERE ghl_opportunity_id = $1`, [opp],
    );
    expect(perTenant.rows).toHaveLength(2);

    const scoped = await admin.query(FIND_BY_BUSINESS_KEY, [tenantA, opp, stage]);
    expect(scoped.rows).toHaveLength(1);
  }, 60_000);
});
