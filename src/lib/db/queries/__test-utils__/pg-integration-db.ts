// pg-integration-db.ts
//
// Boots a REAL PostgreSQL instance (PGlite — Postgres compiled to WASM, not a
// mock or shim) and applies every tracked migration in supabase/migrations/,
// in filename order, exactly as `supabase db push` would. Used by the
// *.integration.test.ts suite to prove schema behavior — real foreign-key
// constraints, real UNIQUE-index enforcement, real SQLSTATE 23505 races,
// real transactions — against the actual DDL this repo ships, not a string
// assertion or a mocked query-builder response.
//
// Why PGlite and not `supabase start`: this environment has no Docker, which
// `supabase start` requires, and no local `psql`/postgres binary. PGlite is a
// genuine PostgreSQL engine (confirmed: reports "PostgreSQL 18.3", raises a
// real 23505 with the real constraint name in its message) that runs without
// either. It is not a PostgREST server, so PostgREST's own HTTP-layer embed
// resolution (the exact PGRST201 error shape) cannot be reproduced here —
// that gap is disclosed explicitly in the test report, not hidden. What CAN
// be proven directly is the underlying CONDITION PostgREST's ambiguity
// detection depends on: how many foreign-key constraints exist between two
// tables. That is real schema introspection, not a string match.
//
// Supabase-specific surface stubbed so real migrations apply unmodified:
//   - roles: anon, authenticated, service_role (referenced by GRANT statements)
//   - schema `auth` with uid()/jwt() stubs (referenced by RLS USING clauses —
//     Postgres validates these exist at CREATE POLICY time)
//   - pgcrypto extension (for gen_random_uuid() — actually core in PG13+, but
//     the migrations still say CREATE EXTENSION IF NOT EXISTS, so it must load)
// Nothing about these stubs affects the constraints/indexes under test — RLS
// policy CONTENTS are not what this suite verifies; the service-role query
// path this app actually uses bypasses RLS by design (see src/lib/db/client.ts).

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../supabase/migrations");

const BOOTSTRAP_DIR = path.resolve(__dirname, "../../../../../supabase/tests/bootstrap");

/**
 * TEST-ONLY pre-history baseline, applied at exact insertion points.
 *
 * `invoices` and `technicians` were created outside the tracked migration
 * history (by hand, via the Supabase dashboard) BEFORE the migrations that
 * reference them were written. Replaying tracked history against an empty
 * database therefore fails with 42P01 on four migrations — a genuine
 * tracked-vs-live drift plus an ordering defect, not a test-engine artifact
 * (a real Supabase stack fails identically).
 *
 * Each bootstrap file is applied immediately BEFORE the first tracked
 * migration that references its table — not all up-front, because these
 * tables' foreign keys point at tables the earlier 20260506* migrations
 * create. NO migration is skipped. See supabase/tests/bootstrap/README.md.
 */
const BOOTSTRAP_BEFORE: Record<string, string> = {
  "20260613000001_invoices.sql": "01_before_20260613000001_invoices.sql",
  "20260717000001_phase9_job_costing.sql": "02_before_20260717000001_technicians.sql",
};

function listMigrationFilesInOrder(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // filenames are YYYYMMDDHHMMSS_description.sql — lexicographic == chronological
}

export interface IntegrationDb {
  db: PGlite;
  /** Every TRACKED migration applied, in order. No skips. */
  appliedMigrations: string[];
  /** Test-only pre-history baseline files applied, in order. */
  appliedBootstrap: string[];
  close: () => Promise<void>;
}

/**
 * Boots a fresh in-memory Postgres and applies every migration in order.
 * Each call is fully isolated — no state survives between calls.
 */
export async function createIntegrationDb(): Promise<IntegrationDb> {
  const db = new PGlite({ extensions: { pgcrypto } });

  // Supabase role stubs — NOLOGIN is fine, only GRANT target resolution matters.
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
      END IF;
    END
    $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
      SELECT NULL::uuid;
    $$ LANGUAGE sql STABLE;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$
      SELECT '{}'::jsonb;
    $$ LANGUAGE sql STABLE;

    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `);

  const files = listMigrationFilesInOrder();
  const applied: string[] = [];
  const bootstrapApplied: string[] = [];

  for (const file of files) {
    // Apply the test-only pre-history baseline for this insertion point first,
    // if one is registered. This reproduces out-of-band DDL that already
    // existed when the tracked migration was originally written — it does not
    // skip, reorder, or modify any tracked migration.
    const bootstrapFile = BOOTSTRAP_BEFORE[file];
    if (bootstrapFile) {
      const bootstrapSql = readFileSync(path.join(BOOTSTRAP_DIR, bootstrapFile), "utf8");
      try {
        await db.exec(bootstrapSql);
        bootstrapApplied.push(bootstrapFile);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Test bootstrap ${bootstrapFile} failed to apply: ${message}`);
      }
    }

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
      applied.push(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Migration ${file} failed to apply: ${message}`);
    }
  }

  return {
    db,
    appliedMigrations: applied,
    appliedBootstrap: bootstrapApplied,
    close: () => db.close(),
  };
}

/** Synthetic, clearly-fake IDs — never real GHL/customer data. */
export const FIXTURE = {
  tenantA: "00000000-0000-4000-8000-00000000000a",
  tenantB: "00000000-0000-4000-8000-00000000000b",
  userA:   "00000000-0000-4000-8000-0000000000ua",
  opp1:    "synthetic-opp-0000000000000001",
  opp2:    "synthetic-opp-0000000000000002",
  contact1: "synthetic-contact-000000000001",
};

/**
 * Minimal seed: one tenant, enough to satisfy work_orders' tenant_id FK.
 * tenants.slug is NOT NULL UNIQUE (real constraint, discovered by running
 * this suite against it) — derived from the tenant id so two calls with
 * different ids never collide, and 20260506000002's own baked-in seed tenant
 * (slug "showtime-pools") is never touched.
 */
export async function seedMinimalTenant(db: PGlite, tenantId = FIXTURE.tenantA): Promise<void> {
  await db.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
    [tenantId, "Integration Test Tenant", `integration-test-${tenantId.slice(-8)}`],
  );
}
