# Test-only pre-history schema baseline

**These files are NOT production migrations. They must never be moved into
`supabase/migrations/`, and must never be applied to production.**

## Why this exists

Two tables in this project were created **outside the tracked migration
history** — by hand, through the Supabase dashboard — before the migrations
that reference them were written:

| Table | Evidence |
|---|---|
| `invoices` | `20260613000001_invoices.sql`'s own header states: *"All target tables already exist (created via Supabase dashboard)."* It `ALTER`s and `GRANT`s a table no earlier migration creates. A `CREATE TABLE IF NOT EXISTS invoices` does exist — but only in `20260711000002` (2026-07-11), a month **after** the June migrations that already depend on it. |
| `technicians` | **No `CREATE TABLE ... technicians` exists in any tracked migration.** The table nonetheless exists in production. `20260717000001` and `20260719000001` both `ALTER`/`REFERENCE` it. |

Consequence: replaying the tracked migration history against an empty
database fails with `SQLSTATE 42P01 (undefined_table)` on four migrations.
This is **not** an artifact of the test engine — it is a genuine
tracked-vs-live schema drift plus a migration-ordering defect, and a real
local Supabase stack fails identically.

These bootstrap files reconstruct the *minimum* pre-existing schema so the
full tracked history can be replayed with **zero skipped migrations**.

## What this does and does not prove

✅ Proves: given the known pre-history state, **every tracked migration
applies cleanly, in order, with no skips** — so the migrations themselves are
internally consistent from that starting point.

❌ Does **not** prove the repository can rebuild production from an empty
database. It cannot, today. That requires a formal, reviewed production
schema baseline — tracked as a separate follow-up, deliberately **not**
attempted during the GHL incident, and explicitly not a squash or rewrite of
production migration history.

## Design rules these files follow

1. Each file models the state expected **immediately before** the first
   tracked migration that references its table — not the current final
   production shape.
2. Columns, constraints, indexes, types, policies and triggers that later
   tracked migrations are expected to add are **deliberately omitted**, so
   those migrations still do real work rather than silently no-op.
3. Derived from read-only production *metadata only*. **No production rows,
   no customer data.**
4. Applied at a specific insertion point in the sequence (see filenames), not
   all up-front — because these tables' foreign keys reference tables that
   earlier tracked migrations create.

## Insertion points

| File | Applied immediately before |
|---|---|
| `01_before_20260613000001_invoices.sql` | `20260613000001_invoices.sql` |
| `02_before_20260717000001_technicians.sql` | `20260717000001_phase9_job_costing.sql` |

Wiring lives in `src/lib/db/queries/__test-utils__/pg-integration-db.ts`.
