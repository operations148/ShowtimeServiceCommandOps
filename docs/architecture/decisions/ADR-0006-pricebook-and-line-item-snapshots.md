# ADR-0006 — Pricebook Model, Cost Visibility, and Line-Item Snapshots

**Status:** Accepted (Phase 2, 2026-07-11)

## Context

Estimates, change orders, invoices, and job costing (Phases 3–6) all need a priced catalog. Markate's pricebook (per the gap analysis) is the reference feature. Two hard requirements shaped the design: internal cost must never leak to unauthorized roles, and financial documents must never retroactively change when the catalog is edited.

## Decisions

### 1. Three tables, soft delete only

`pricebook_categories`, `pricebook_items`, `pricebook_bundle_items` (see `database-blueprint/pricebook.md`). Archive = `archived_at` timestamp + `is_active=false`; **nothing is ever hard-deleted** — historical documents keep resolvable references. Restore clears both.

### 2. One item table for all seven types

`item_type` enum (`service|labor|material|equipment|fee|discount|bundle`) on a single table rather than per-type tables. The fields are ~identical across types; per-type tables would multiply every query, route, and UI surface by seven. Type-specific behavior (e.g. discounts applied subtractively) lives at the document layer. Prices are non-negative by CHECK constraint — a "discount" item stores a positive amount with `item_type='discount'`.

### 3. Bundles are single-level

`pricebook_bundle_items` maps a bundle to child items with quantities. **Nesting is rejected** (a bundle cannot contain a bundle — enforced at the API layer plus a self-reference CHECK). Snapshot expansion stays single-level and predictable; nothing in the Markate gap analysis needs recursive kits.

### 4. Cost visibility is a server-side permission, not a UI toggle

`internal_cost` is stripped from every API response by `src/lib/pricebook/cost-visibility.ts` unless the role holds `canViewItemCosts`. The matrix (pinned by `src/config/roles.test.ts`):

| Role | view | create | edit | archive | view cost | export |
|---|---|---|---|---|---|---|
| PLATFORM_OWNER / TENANT_ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| OFFICE_STAFF | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| TECHNICIAN | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| READ_ONLY_OWNER | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |

Corollaries: a role that cannot **view** costs cannot **write** them either (403, not silent zeroing); `canExportPricebook` alone never includes costs in the CSV — the export checks `canViewItemCosts` independently. Technicians get no pricebook surface in Phase 2; revisit when Phase 3 estimate-building reaches the tech mobile view.

### 5. Line-item snapshots (the immutability foundation)

`createLineItemSnapshot()` (`src/lib/documents/line-item-snapshot.ts`) copies name, description, unit, quantity, unit price, unit cost, tax behavior, discount, markup, and computed total, plus `source_pricebook_item_id` + `source_pricebook_version`. The result is `Object.freeze`d; totals come from the money module. `invoice_line_items` carries matching columns (migration 20260711000002) so Phase 3+ documents persist snapshots, not references.

- The source pointer is for **drift detection only** ("this estimate used v3 pricing; the item is now v7") — never for re-pricing.
- `pricebook_items.version` doubles as the snapshot source version and the optimistic-concurrency token; every successful edit bumps it.

### 6. Optimistic concurrency

Item/category PATCH and bundle PUT require the `version` the client last read. Writes are predicated `…AND version = :expected`; a stale write matches zero rows and returns **409 + currentVersion** (vs 404 when the row truly doesn't exist — distinguished by a follow-up read). Archive/restore are deliberately version-less: they're idempotent state flips where blocking on staleness hurts more than it protects.

### 7. CSV export yes, import no

Export is implemented with formula-injection hardening (cells starting `= + - @ TAB` are quoted with a leading `'`; RFC 4180 quoting; pinned by tests). **Import is deliberately deferred**: parsing untrusted spreadsheets (encoding, dialects, dedup/merge semantics, partial-failure UX) can't be built *and tested* responsibly inside this phase, and the prompt allows exactly that call ("Import/export only if it can be secured and tested within this phase").

## Alternatives considered

- **Reference-based line items with price history tables** — rejected: reconstructing "what did the customer approve" from history joins is fragile; snapshots make the document self-contained.
- **Separate cost table with row-level grants** — rejected: Postgres grants don't apply per-role here (everything runs as service_role); app-layer redaction is the enforceable boundary today.
- **ETag/If-Match instead of body version** — rejected: version-in-body matches the existing API style and survives the UI's fetch wrapper unchanged.

## Consequences

- Phase 3 estimates consume `createLineItemSnapshot()` + `calcDocumentTotals()` + `nextDocumentNumber()` as-is; no new financial primitives should be needed.
- Every new pricebook API surface must route responses through `redactItemCosts()` — a raw `select *` return is a review-blocking leak.
- Bundle pricing at document time = expand children into individual snapshots (single-level), keeping per-line costing accurate for Phase 6 job costing.
