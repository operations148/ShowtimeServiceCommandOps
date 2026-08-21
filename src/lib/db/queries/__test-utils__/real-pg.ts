// real-pg.ts
//
// Helpers for the REAL multi-connection PostgreSQL lane (CI only).
//
// PGlite (see pg-integration-db.ts) is a single-process engine: db.clone()
// does not share storage, so it cannot prove two independent backend sessions
// racing on one unique constraint. This module talks to a genuine PostgreSQL
// server over TCP via `pg`, so each Client is a separate backend session with
// its own transaction — which is what makes deterministic interleaving
// provable rather than inferred.
//
// SAFETY: assertIsolatedTestDatabase() runs before anything else and hard-
// fails on any host that is not local, and on the production project ref.
// Nothing in this file may ever run against production.

import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../../supabase/migrations");
const BOOTSTRAP_DIR = path.resolve(__dirname, "../../../../../supabase/tests/bootstrap");

/** Production Supabase project ref — must NEVER appear in a test connection string. */
const FORBIDDEN_PRODUCTION_REF = "yyjbfjnpmjcraehecbvi";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

/**
 * Hard safety gate. Throws unless the connection string points at an
 * isolated local/CI-service database. Called before every connection.
 */
export function assertIsolatedTestDatabase(connectionString: string): void {
  if (connectionString.includes(FORBIDDEN_PRODUCTION_REF)) {
    throw new Error(
      "REFUSING TO CONNECT: test database URL contains the production Supabase project ref.",
    );
  }
  if (/supabase\.(co|com)/i.test(connectionString)) {
    throw new Error("REFUSING TO CONNECT: test database URL points at a hosted Supabase project.");
  }

  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    throw new Error("REFUSING TO CONNECT: test database URL is not parseable.");
  }

  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(
      `REFUSING TO CONNECT: test database host "${host}" is not an isolated local/CI host.`,
    );
  }
}

export function getTestDatabaseUrl(): string | undefined {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return undefined;
  assertIsolatedTestDatabase(url);
  return url;
}

export async function connect(connectionString: string): Promise<Client> {
  assertIsolatedTestDatabase(connectionString);
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

// ── Migration replay (identical ordering + baseline to the PGlite lane) ──────

const BOOTSTRAP_BEFORE: Record<string, string> = {
  "20260613000001_invoices.sql": "01_before_20260613000001_invoices.sql",
  "20260717000001_phase9_job_costing.sql": "02_before_20260717000001_technicians.sql",
};

export interface ReplayResult {
  appliedMigrations: string[];
  appliedBootstrap: string[];
  totalOnDisk: number;
}

/**
 * Applies the Supabase-platform stubs, then every tracked migration in
 * timestamp order with the test-only pre-history baseline injected at its
 * insertion points. NO migration is skipped.
 *
 * Starts by DROPPING and recreating the schemas, so the replay is a true
 * from-scratch run and is safe to invoke more than once against the same
 * container (vitest runs this suite both in the full `npm test` sweep and in
 * its own dedicated CI step — without a clean slate the second run fails with
 * "type user_role already exists").
 *
 * `connectionString` is required purely so the isolation guard can run again
 * immediately before destructive DDL. This function drops schemas; it must be
 * impossible to aim it at anything but a throwaway test database.
 */
export async function replayAllMigrations(
  client: Client,
  connectionString: string,
): Promise<ReplayResult> {
  // Re-assert before any DROP. Defence in depth on top of connect()'s check.
  assertIsolatedTestDatabase(connectionString);

  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULL::uuid; $$ LANGUAGE sql STABLE;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb AS $$ SELECT '{}'::jsonb; $$ LANGUAGE sql STABLE;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const appliedMigrations: string[] = [];
  const appliedBootstrap: string[] = [];

  for (const file of files) {
    const bootstrapFile = BOOTSTRAP_BEFORE[file];
    if (bootstrapFile) {
      await client.query(readFileSync(path.join(BOOTSTRAP_DIR, bootstrapFile), "utf8"));
      appliedBootstrap.push(bootstrapFile);
    }
    try {
      await client.query(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
      appliedMigrations.push(file);
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { appliedMigrations, appliedBootstrap, totalOnDisk: files.length };
}

/** Synthetic-only fixtures. Never real GHL/customer data. */
export const RPG_FIXTURE = {
  tenantA: "00000000-0000-4000-8000-0000000000a1",
  tenantB: "00000000-0000-4000-8000-0000000000b1",
  opp:     "synthetic-concurrency-opp-000001",
  contact: "synthetic-concurrency-contact-01",
  stage:   "Diagnosis Booked",
};

export async function seedTenant(client: Client, tenantId: string, slugSuffix: string): Promise<void> {
  await client.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
    [tenantId, "Concurrency Test Tenant", `concurrency-test-${slugSuffix}`],
  );
}
