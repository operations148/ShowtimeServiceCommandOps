# Phase 2 Memory — Core Data Model, Money Foundation, Pricebook

_Completed 2026-07-11 on branch `feat/serviceops-phase-2-pricebook`. Full rationale in ADR-0005 and ADR-0006; spec in `specs/pricebook.md`; schema in `database-blueprint/pricebook.md`._

## Primitives later phases MUST reuse (never reinvent)

1. **Money**: `src/lib/money/money.ts` — integer cents everywhere, half-up float-safe rounding, `calcDocumentTotals` (tax on taxable lines after proportional discount allocation), deposits, gross profit/margin. New inline money arithmetic is a review-blocking smell.
2. **Numbering**: `nextDocumentNumber(tenantId, type)` — atomic tenant-scoped sequences (`document_sequences` + `next_document_number()` UPSERT). Both legacy `COUNT(*)+1` sites replaced; backfill seeds above already-issued INV numbers. `wo_number` grandfathered (global DB identity).
3. **Snapshots**: `createLineItemSnapshot()` — frozen, self-contained line items with `source_pricebook_item_id`/`source_pricebook_version` (drift detection only, never re-pricing). `invoice_line_items` already carries the columns.
4. **Cost privacy**: `redactItemCosts()` — every API response with `internal_cost`/`unit_cost` passes through it. Office staff manage the pricebook but never see or set costs.

## Schema reconciliation outcome

- `src/types/estimate.ts` **deleted** (zero importers; conflicting 7-state InvoiceStatus). `src/types/invoice.ts` is the single invoice model. Phase 3 designs `estimates` fresh — do not resurrect the deleted types.
- `invoices`/`invoice_line_items` now have tracked `CREATE TABLE IF NOT EXISTS` baselines (no-op on live DB). Fresh-env provisioning is still blocked by migration 019 (ALTERs a dashboard-created table); the fix is a live schema dump, never rewriting 019.
- Migration `20260711000002` is **not applied to any live database** — application requires explicit approval.

## Decisions with teeth

- Optimistic concurrency: PATCH/bundle-PUT carry `version`; stale → **409 + currentVersion**. Archive/restore are version-less by design (idempotent flips).
- Bundles are single-level; nesting rejected at API + CHECK constraint.
- CSV **export** shipped (formula-injection-safe; costs require `canViewItemCosts` independently of `canExportPricebook`). CSV **import deliberately deferred** — allowed by the phase prompt's "only if it can be secured and tested within this phase."
- Technicians: zero pricebook access in Phase 2; revisit when estimate-building reaches the tech mobile view.

## Verification gaps (flagged, not hidden)

- Sequence concurrency: unit-tested at the wrapper (mocked client) + `scripts/verify-sequence-concurrency.sql` for staging. No live-DB integration test (no test DB in CI yet).
- Pricebook UI: typecheck/build-verified, not yet browser-tested — same class of gap as Phase 1's CSP check (`qa/security-test-plan.md` #18).
