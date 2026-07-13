# Phase 3 Memory — Full Estimates, Proposals, Secure Customer Approval

_Completed 2026-07-12 on branch `feat/serviceops-phase-3-estimates`. Rationale in ADR-0007 (public tokens) + ADR-0008 (versioning/locking/acceptance); spec in `specs/estimates.md`; schema in `database-blueprint/estimates.md`._

## What was built

A new **estimate document layer** (`estimates` + `estimate_line_items` + `estimate_versions` + `estimate_events`) alongside the untouched `estimate_handoffs` technician flag (preserved as the "Needs Estimate" tab — no data lost). One 9-state machine (`src/lib/estimates/state-machine.ts`). Migration `20260711000003` — additive, **NOT applied to any live DB**.

## Primitives / patterns later phases reuse

- **First unauthenticated surface**: `/estimate/[token]` + `/api/public/estimates/*`. Token pattern (ADR-0007): 256-bit random, SHA-256 hash-at-rest (`src/lib/estimates/public-token.ts`), expiry + revoke, IP rate limits (`publicEstimateView`/`publicEstimateDecision`), ONE generic error (no oracle), tenant derived from the row not the caller. Phase 7 customer portal should build on this.
- **Redaction is an allowlist type**: `PublicEstimate`/`toPublicEstimate` (`public-serializer.ts`) — internal fields structurally cannot be copied out. A test greps the serialized JSON for secrets. Any new public surface must do the same.
- **Transactional idempotent decisions** (ADR-0008, `decisions.ts`): acceptance is an atomic conditional UPDATE (`WHERE version=? AND status IN (sent,viewed)`) — exactly one concurrent submit wins; replay returns `alreadyDecided`. Reuse this claim pattern for any public one-shot action.
- **Estimate→invoice conversion is idempotent** via partial `UNIQUE(invoices.estimate_id)`. Acceptance materialises a **DRAFT** invoice only — Phase 5 owns sending/deposit/payment. Phase 5 must NOT double-create; check `converted_invoice_id` / the unique index.
- **Safe mailer** (`email/safe-mailer.ts`): `ESTIMATE_EMAIL_MODE` = preview(default)/test/live; test redirects to `ESTIMATE_TEST_RECIPIENT`; live is the external-action gate. Reuse for any future customer email.
- Totals ALWAYS server-side from selected lines (`totals.ts`, reuses Phase 2 money module); client never trusted.

## Deliberately deferred / out of scope

- Real customer email off by default (preview mode) — do not flip to live without approval.
- Autonomous follow-up / marketing automation — forbidden (GHL owns it).
- In-editor pricebook item PICKER — the API already snapshots `source_pricebook_item_id` server-side; the editor ships custom-line entry. UI picker is a follow-up.
- Attachments upload, rich proposal templates beyond 'standard', drag-reorder — snapshot/template fields exist; UI deferred.
- Invoice send/deposit/payment — Phase 5.

## Verification gaps (flagged, not hidden)

- Concurrency (double-accept), duplicate-conversion, rate-limit, token-expiry/revocation, and cross-tenant token checks need a **live DB / deployed preview** — no test DB in CI (same standing gap as Phase 2 sequence concurrency). Enumerated in `qa/estimate-test-plan.md`.
- Admin + public UIs are typecheck/build-verified, not browser-tested.
- 168→ tests pass (added ~90 across state machine, totals/selection, token, serializer redaction, mailer, escape-html, pdf-text, redact-costs, roles matrix).
