# ADR-0005 — Money Arithmetic and Document Numbering

**Status:** Accepted (Phase 2, 2026-07-11)

## Context

Phase 0 found financial math scattered and inconsistent: inline `Math.round(total * 0.10)` for deposits, app-layer `COUNT(*)+1` invoice numbering (race-prone), two incompatible `InvoiceStatus` models, and no shared utilities. Phases 3–6 (estimates, change orders, invoicing, job costing) all build on this math, so it must be settled once, now.

## Decision

### 1. Integer cents everywhere

All monetary amounts are integer cents in TypeScript, `INTEGER` in Postgres. The only decimals are **rates**: `tax_rate NUMERIC(7,6)` (decimal 0–1, e.g. `0.0875`), `deposit_percent NUMERIC(5,2)`, `markup_percent NUMERIC(7,4)`. Quantities are `NUMERIC(12,3)` (1.5 hours is real).

### 2. One arithmetic module: `src/lib/money/money.ts`

Every derived amount — line totals, tax, discounts, markups, deposits, amount due, gross profit/margin — goes through this module. **Authoritative totals are computed server-side**; browser math is display-only and never persisted.

- **Rounding is half-up**, applied exactly once per derived amount, never twice on intermediates. `roundHalfUp` snaps to 6 decimal places first to defeat IEEE-754 artifacts (`19.99 * 100 === 1998.9999999999998`; `1.005 * 100 === 100.49999999999999`) — both cases are pinned by tests.
- **Tax** is computed on taxable lines only, after discounts. A document-level discount is allocated to the taxable base proportionally to the taxable share of the subtotal (standard US sales-tax treatment). Pinned by tests.
- **Discounts clamp** to what they discount; totals never go negative; `amount_due` floors at zero on overpayment.
- **Gross margin is `null`** (undefined), not 0, when revenue is zero — callers must render the distinction.
- Guards (`assertCents`, `assertRate`, `assertQuantity`) throw `RangeError` on floats-as-cents, percent-style rates (8.75 vs 0.0875), negatives, NaN/Infinity.

### 3. Tenant-scoped document numbering: `document_sequences` + `next_document_number()`

`COUNT(*)+1` is replaced by a Postgres function that claims numbers via a single atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` on a `(tenant_id, doc_type)` row.

**Concurrency behavior (the documented contract):**
- Concurrent callers serialize on the row-level lock Postgres takes for the UPSERT; each receives a distinct, monotonically increasing value. **Duplicates are impossible by construction.**
- supabase-js runs in autocommit, so a claimed number commits immediately; if the subsequent document INSERT fails, that number is **skipped, never reused** (gaps acceptable, duplicates not). Inside an explicit transaction the claim would roll back with the document (gapless) at the cost of holding the lock until commit.
- Verification: `scripts/verify-sequence-concurrency.sql` (1,000-claim uniqueness/gaplessness check + a documented two-terminal row-lock demonstration). Wrapper-level behavior (formatting, error propagation, no-COUNT-fallback) is unit-tested with a mocked client.
- A backfill seeds each tenant's invoice sequence **above** the highest number the old `COUNT+1` logic ever issued (parsed from existing `invoice_number` values), so the first sequence-issued number cannot collide.

**`wo_number` deliberately stays as-is.** It predates this system as a DB `GENERATED ALWAYS AS IDENTITY` column — already concurrency-safe. It is globally (not tenant-) scoped, which leaks nothing worse than volume ordering and is already printed on customer-visible documents; renumbering live work orders is all risk, no benefit. New document types must use `document_sequences`; `wo_number` is grandfathered.

### 4. Number formatting

App-side: `INV-0007`, `EST-0042`, `CO-0001`, `PAY-0999` (`padStart(4)`, widening naturally past 9999). The DB stores the formatted string on the document row and the raw counter in the sequence table.

## Alternatives considered

- **Floating-point dollars** — rejected; classic sub-cent drift.
- **Postgres native sequences per tenant** (`CREATE SEQUENCE` per tenant+type) — rejected: dynamic DDL at tenant-creation time, harder to inspect/correct, no tenant FK integrity.
- **UUID/random document numbers** — rejected: humans read these on invoices; sequential is a hard product expectation.
- **Keeping COUNT+1 with a retry loop** — rejected: still racy between count and insert, and voided/deleted rows shift the count backwards into collisions.

## Consequences

- All future money math must import `src/lib/money/money.ts`; new inline arithmetic is a review-blocking smell.
- Phase 3+ document types (estimates, change orders, payments) get numbering for free via `nextDocumentNumber(tenantId, type)`.
- The sequence table is service-role-only; no browser path can claim or observe counters.
