# Spec — Estimates & Proposals (Phase 3)

Full tenant-safe estimate/proposal documents with a secure customer approval flow. Upgrades the technician "needs estimate" handoff (which is preserved as its own view) into priced documents ServiceOps owns end-to-end. GHL references are kept but ServiceOps owns the operational estimate + approval history. Design: ADR-0007 (public tokens), ADR-0008 (versioning/locking/acceptance). Schema: `database-blueprint/estimates.md`.

## Lifecycle

`draft → ready → sent → viewed → accepted → converted`, plus `declined`, `expired`, `voided`. One state machine (`src/lib/estimates/state-machine.ts`). Edits allowed only in draft/ready. Accepted/converted/voided are effectively locked (converted/voided terminal).

## What it does

- **Create/edit** priced estimates: customer snapshot, work-order/handoff/GHL links, tenant-safe `EST-XXXX` number, issue/expiry, pricebook or custom lines, quantity/unit/price, tax, discounts, per-line kind (standard/optional/recommended) with option groups, customer + internal notes, terms, template, estimator, version. **All totals computed server-side** from selected lines only.
- **Proposal options**: customers select optional/package lines (one-per-option-group), recalculated server-side from the stored version.
- **Versioning/locking**: draft edits bump version; immutable snapshots at draft-save, send, and acceptance; accepted version locked; permissioned + reasoned + audited override to re-open.
- **Manual send**: explicit action via a safe mailer — **preview by default** (no delivery), `test` mode redirects to `ESTIMATE_TEST_RECIPIENT`, `live` requires an explicit env opt-in (the external-action gate). Send log with failure state + manual retry (resend).
- **Secure public page** `/estimate/[token]`: hashed token, expiry, revocation, IP rate limit, generic errors, tenant branding, mobile-first, marks viewed, accept (typed-name signature + terms ack) / decline (reason). Only redacted fields (`PublicEstimate`) — no costs/internal notes/GHL/tenant ids.
- **Acceptance**: transactional + idempotent (atomic status+version claim), recomputes totals, locks the accepted version, converts to a **draft invoice** (idempotent — no duplicates), audits everything. Replay = no-op success.
- **PDF**: proposal PDF from the redacted public view (internal fields structurally absent); all values sanitized.
- **Admin UI**: two-tab workspace (Estimates documents + preserved "Needs Estimate" handoff view); list/search/status-filter; create/edit; detail with send (+ copyable public link), PDF, activity timeline, version history, override, void, mark-ready.

## API

| Route | Methods | Permission |
|---|---|---|
| `/api/estimates` | GET (q,status,work_order_id), POST | view / manage |
| `/api/estimates/[id]` | GET, PATCH (version) | view / manage |
| `/api/estimates/[id]/transition` | POST (version, to) | manage (+ canVoidEstimates for void) |
| `/api/estimates/[id]/send` | POST (version, recipient?, expires_in_days) | canSendEstimateEmail (rate-limited) |
| `/api/estimates/[id]/override` | POST (reason) | canOverrideEstimateLock |
| `/api/estimates/[id]/revoke-token` | POST | manage |
| `/api/estimates/[id]/versions` | GET | view |
| `/api/estimates/[id]/activity` | GET | view |
| `/api/estimates/[id]/pdf` | GET | view |
| `/api/public/estimates/[token]` | GET | none (token) — rate-limited, redacted |
| `/api/public/estimates/[token]/accept` | POST | none (token) — idempotent |
| `/api/public/estimates/[token]/decline` | POST | none (token) — idempotent |

Permissions (Phase 3): view=`canViewEstimates`, manage=`canManageEstimates`, void=`canVoidEstimates`, send=`canSendEstimateEmail` (Phase 1), override=`canOverrideEstimateLock` (Phase 1). Estimate-line cost visibility rides `canViewItemCosts`. Matrix pinned by `src/config/roles.test.ts`.

## Response conventions

`{ data }` (201 on create). Validation 422 + `fieldErrors`. Stale version → **409** + `currentVersion`. Not-editable status → 409. Cross-tenant/unknown → 404. Public failures → one generic 404 (no oracle); expired → 410; already-decided → idempotent success.

## Deliberately out of scope (Phase 3)

- **Autonomous follow-up / marketing automation** — forbidden (GHL owns this).
- **Real customer email by default** — gated behind `ESTIMATE_EMAIL_MODE=live`.
- **Invoice sending / deposit collection / payment** — Phase 5 (acceptance only materialises a draft invoice).
- **Attachments upload UI, drag-reorder, rich proposal templates beyond 'standard'** — deferred; template field + snapshot foundation are in place.
- **In-page pricebook item picker in the editor** — custom lines + server-side pricebook snapshotting by `source_pricebook_item_id` are supported by the API; the editor ships custom-line entry (picker is a Phase 3.x/UI follow-up).

## Environment

- `ESTIMATE_EMAIL_MODE` = `preview` (default) | `test` | `live`
- `ESTIMATE_TEST_RECIPIENT` = redirect address when mode=test
- `NEXT_PUBLIC_APP_URL` = base for the public estimate link

## Tests

State machine (17), totals/selection (16), public token (14), public serializer redaction (11), safe mailer modes (10), escape-html (6), pdf-text (6), redact-costs (8) — plus manual `qa/estimate-test-plan.md` covering the security-critical flows that need a live DB/browser.
