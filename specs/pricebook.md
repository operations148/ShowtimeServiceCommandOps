# Spec — Pricebook (Phase 2)

The tenant's priced catalog: services, labor rates, materials, equipment, fees, discounts, and bundles. Estimates (Phase 3), change orders, and invoices draw line items from it via immutable snapshots. Design rationale: `docs/architecture/decisions/ADR-0006-pricebook-and-line-item-snapshots.md`. Schema: `database-blueprint/pricebook.md`.

## What it does

- **Catalog management** at `/dashboard/pricebook`: search (name/description, debounced), filter by type/category/archived, desktop table + mobile cards, create/edit modal, archive/restore, category manager, CSV export.
- **Money**: `customer_price` and `internal_cost` are integer cents; the UI accepts dollars and converts. All arithmetic goes through `src/lib/money/money.ts`.
- **Cost privacy**: `internal_cost` is stripped server-side for roles without `canViewItemCosts` (office staff, technicians). Roles that can't view costs can't set them (403).
- **Soft archive only** — items/categories are never hard-deleted; archived items stay resolvable for historical documents and can be restored.
- **Optimistic concurrency**: edits carry the row `version`; stale writes get 409 + `currentVersion` and the UI prompts a reload.
- **Bundles**: single-level composition (no nested bundles) managed via `PUT /api/pricebook/items/[id]/bundle`.
- **Images**: per-item image through the Phase 1 secure pipeline (magic-byte sniff, re-encode, EXIF strip) into the public `pricebook-images` bucket.
- **Audit**: every mutation and export writes a `pricebook.*` event to `user_activity_log`.

## API

| Route | Methods | Permission |
|---|---|---|
| `/api/pricebook/items` | GET (q, item_type, category_id, include_archived, active), POST | view / create |
| `/api/pricebook/items/[id]` | GET (`?with_bundle=true`), PATCH (requires `version`), DELETE (=archive) | view / edit / archive |
| `/api/pricebook/items/[id]/restore` | POST | archive |
| `/api/pricebook/items/[id]/image` | POST (multipart `file`), DELETE | edit |
| `/api/pricebook/items/[id]/bundle` | GET, PUT (requires `version`) | view / edit |
| `/api/pricebook/categories` | GET, POST | view / create |
| `/api/pricebook/categories/[id]` | PATCH (requires `version`), DELETE (=archive) | edit / archive |
| `/api/pricebook/categories/[id]/restore` | POST | archive |
| `/api/pricebook/export` | GET (CSV; costs only with `canViewItemCosts`) | export |

Permissions map: view=`canViewPricebook`, create=`canCreatePricebookItems`, edit=`canEditPricebookItems`, archive=`canArchivePricebookItems`, export=`canExportPricebook`. Role matrix in ADR-0006 §4, pinned by `src/config/roles.test.ts`.

## Response conventions

- Success: `{ data }` (201 on create). Validation: 422 with `fieldErrors`. Stale version: **409** `{ error, currentVersion }`. Duplicate category name: 409. Cross-tenant/unknown id: **404** (never 403 — existence must not leak). Cross-tenant reference in a body (`category_id`, bundle children): **422**.

## Deliberately out of scope (Phase 2)

- **CSV import** — deferred (ADR-0006 §7; can't be secured and tested well in-phase).
- **Technician pricebook access** — no tech surface yet; revisit with Phase 3 estimate-building.
- **Bundle composition UI** — API-complete; the edit modal manages item fields, composition editing via API until Phase 3's estimate builder needs richer UI.
- **Nested bundles, price history/versioned price lists, vendor catalogs, inventory/stock tracking** — the last is explicitly forbidden scope ("no enterprise inventory module").

## Tests

Money (41), numbering wrapper (7), cost redaction (6), permission matrix (4), snapshot immutability (9), CSV/injection (7) — plus SQL-level sequence verification in `scripts/verify-sequence-concurrency.sql` and manual cross-tenant checks added to `qa/tenant-isolation-test-plan.md`.
