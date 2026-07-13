# Master Implementation Plan — ServiceOps Markate-Inspired Expansion

_Derived from Phase 0's repository audit, security audit, database ERD, and Markate gap analysis. This plan sequences Phases 1–11 of `ServiceOps_Claude_Code_All_Phases.md` against the actual current-state findings, not the phase-prompt's assumed baseline._

## Guiding constraints (non-negotiable, carried from ADR-0001 and the phase-prompt rules)

- GHL remains source-of-truth for contacts/conversations/pipeline/calendar/marketing — no phase duplicates this.
- No AI voice, Conversation AI, marketing automation, Shopify, Slack, integration marketplace, or native mobile app at any phase.
- Every tenant-owned query must be explicitly tenant-scoped; no hardcoded tenant fallback (none currently exists — keep it that way).
- Additive migrations only; no rewriting applied migrations.
- Tests are added per material behavior starting Phase 1 (no test framework exists yet — Phase 1 selects one).
- Stop before: production Supabase migration, production deployment, live Stripe action, live customer email, live GHL credential/workflow change, DNS change, merge to production, destructive production-data action.

## Phase dependency graph

```
Phase 0 (this phase) — audit, no code changes to product behavior
    │
    ▼
Phase 1 — Security/tenancy/authorization/audit/reliability foundation  ◄── RELEASE BLOCKER for everything below
    │
    ▼
Phase 2 — Core data model, money utilities, tenant-safe numbering, pricebook
    │  (also resolves the invoice/estimate type-drift found in Phase 0)
    │
    ├──────────────┬──────────────┐
    ▼              ▼              ▼
Phase 3         Phase 4        Phase 9 (time/mileage/expense schema
Estimates    Dispatch/Calendar   can start once Phase 2 money utilities exist,
                 │                but job-costing needs Phase 5's work-order model)
                 ▼
             Phase 5 — Work-order expansion, change orders
                 │
                 ▼
             Phase 6 — Invoices/Stripe/reconciliation (completes what Phase 0 found half-built)
                 │
                 ▼
             Phase 7 — Customer portal (needs Phase 3 estimates + Phase 6 invoices + Phase 1 token security)
                 │
                 ▼
             Phase 8 — Technician PWA / offline sync (needs Phase 4 dispatch + Phase 5 work-order model)
                 │
                 ▼
             Phase 10 — Reporting/platform admin/white-label (needs financial data from Phase 6/9)
                 │
                 ▼
             Phase 11 — Production readiness / security / QA / deployment
```

Phase 9 (time/mileage/expenses/job-costing) can begin its schema work in parallel with Phase 4/5 once Phase 2's money utilities exist, but its job-costing rollup depends on Phase 5's work-order model being final — sequenced after Phase 5 in practice even though there's no hard technical blocker preventing earlier schema work.

## Phase-by-phase plan, keyed to Phase 0 findings

### Phase 1 — Security, tenancy, authorization, audit, reliability (release blocker)

**Directly addresses these Phase 0 findings:**
- H1 (no login rate limiting) → durable rate limiter on login, password reset, invitation acceptance, uploads, payment-session creation, exports, reports, webhooks, admin actions.
- H2 (no session revocation) → session-version column + revocation on role change/deactivation/password change.
- H3 (cron fails open) → fail-closed pattern for all cron/admin routes when a required secret is missing.
- H4 (send-estimate exfil path) → granular permissions replace the flat 9-flag model; every route re-audited for correct permission + ownership checks (this specific route needs `requirePermission` + work-order ownership).
- M1 (RLS inert) → RLS policy review scoped to match the new granular permission model; decide explicitly whether RLS stays defense-in-depth-only (documented, accepted) or whether a Supabase-Auth-compatible session-variable path is added so it's actually reachable — this decision needs an ADR, not a silent choice.
- M2/M3 (unenforced-tenantId delete functions, hard-delete blast radius) → make `tenantId` a required parameter on every delete function; add soft-delete (`status = 'cancelled'`/`is_active`) as the default path for work orders, replacing hard delete.
- M7/M8 (visit/photo IDOR and missing ownership checks) → fix as part of the granular-permission rollout.
- M9/M10 (no security headers, no CSRF layer) → add CSP/HSTS/frame-ancestors/etc. in `next.config.ts`; add origin validation for cookie-authenticated mutations.
- M11/M12 (invitations: untracked table, plaintext token, TOCTOU race) → migrate `user_invitations` into a tracked migration with a hashed token column and an atomic, race-safe acceptance transaction.
- M14/M15 (secret-metadata and PII in logs) → structured logger with redaction, replacing ad hoc `console.*` calls.
- M16 (validate-env.sh not wired) → wire real startup env validation with an accurate variable list, or remove the stale claim from the docs if a different mechanism is chosen.
- L1 (non-constant-time comparisons), L2 (test-connection route with no auth) → fix/delete respectively.
- The identity-model question (M18: per-tenant-unique email, no tenant disambiguation at login) → resolve with an explicit ADR (global identity + memberships, vs. tenant-slug+email) rather than leaving it ambiguous.
- GHL retry queue durability (already known gap, reconfirmed) → durable outbox table replacing `src/lib/ghl/retry-queue.ts`.
- Dead `globalThis.waitUntil` check → replace with the real `waitUntil`/`after()` API for the Vercel runtime actually in use.

**Tests to add**: cross-tenant denial, read-only mutation denial, technician scoping, session revocation on role change/deactivation, invitation replay, login rate limiting, CSRF/origin rejection, webhook invalid signature + duplicate event, unauthorized file deletion, MIME spoofing, oversized image, missing cron secret, redacted logging. This is also where the test framework itself gets chosen (Vitest for unit/integration, given the Next.js 15 + TS-strict stack; Playwright reserved for later public-token/portal E2E work in Phase 3/7).

**Dependency-audit action** (from `docs/audits/dependency-audit.md`): upgrade `next`/`eslint-config-next` to 15.5.20 and run non-force `npm audit fix` as part of this phase's CI/supply-chain work, before the security-header/middleware changes land on top of it.

### Phase 2 — Core data model, money, pricebook

**Directly addresses:**
- The two-`InvoiceStatus` type-drift (M17) — pick `src/types/invoice.ts` as authoritative, delete or explicitly repurpose `src/types/estimate.ts`'s dead `Invoice`/`InvoiceItem`/`Payment` types.
- The untracked `invoices`/`user_invitations`/`invoice_line_items` tables — write migrations that reconstruct their actual current schema (via a live `information_schema` dump) so the migrations directory becomes a true source of truth again, before adding anything new on top.
- `wo_number`'s pattern (true DB identity column) is the right model — apply the same to new document numbers (estimates, change orders, invoices already need this reconciled since invoices currently use app-layer `COUNT+1`, which is not concurrency-safe).
- Pricebook is entirely new — build per the phase-prompt spec, with cost hidden from technician/portal views by permission flag from day one (don't bolt this on later).

### Phase 3 — Full estimates and customer approval

**Directly addresses:**
- The estimate module currently being a status-flag queue, not a document (Markate gap analysis "Missing").
- The dead `accept_token`/`accept_token_expires_at` columns — either wire them up properly (hashed at rest, expiring, rate-limited) or drop them and design the public-token mechanism fresh as part of this phase; do not silently reuse unhashed UUID columns designed before Phase 1's security work landed.
- The non-existent `/estimate/[token]` page that Stripe's own redirect already points at — build it here, and only then does the Phase-15 deposit-checkout code (already built) become reachable end-to-end.

### Phase 4 — Dispatch, calendar, visit administration, recurring work

**Directly addresses:**
- No dispatch/calendar UI exists at all (gap analysis "Missing").
- `visits` table's current 1-technician, 1-active-visit-per-work-order UNIQUE constraint is incompatible with multi-technician assignment — needs an additive migration (new assignment join table) rather than removing the existing constraint outright (which other code paths may rely on).
- Recurring-schedule generation cron already exists and is idempotent per the current design — extend rather than replace, but move its auth model to the Phase-1 fail-closed pattern.

### Phase 5 — Work-order expansion and change orders

**Directly addresses:**
- No parent/child work-order model, no change-order table — both net new.
- `deleteWorkOrder`'s hard-delete-with-cascade behavior (M2/M3) should be replaced by this phase's archive/cancel model as the primary mechanism, once Phase 1 makes `tenantId` mandatory on the function signature.

### Phase 6 — Invoices, Stripe Connect payments, reconciliation

**Directly addresses:**
- **Correction from the module-verification pass**: the existing invoice/Stripe backend (`createInvoiceFromEstimate`, `createDepositCheckoutSession`) is not merely "missing a UI" — it has **zero callers anywhere in the app today**. The first, most basic task in this phase is wiring a real trigger (estimate acceptance in Phase 3 calling `createInvoiceFromEstimate`, and an admin/portal action calling `createDepositCheckoutSession`) before any UI or reconciliation work is meaningful — building an invoice list page on top of code nothing ever invokes would just move the "orphaned" problem, not fix it.
- Completes what Phase 0 found half-built: admin invoice list/detail UI (currently doesn't exist — and the sidebar already has a dead "Invoices" link pointing at it, `src/config/navigation.ts` → `/dashboard/invoices`, fix this as part of shipping the page), reconciling the untracked `invoices`/`invoice_line_items` tables from Phase 2's schema work, verifying `invoice_line_items` grants actually work (Phase 0 could not confirm whether line-item snapshots are silently failing today).
- Stripe webhook/checkout code from the prior session is a good foundation (idempotent, tenant-resolved-from-connected-account) — extend, don't rewrite.

### Phase 7 — Customer portal

**Directly addresses:**
- Zero customer-facing surface currently exists — this is new attack surface built entirely on Phase 1's security foundation (hashed/expiring tokens, rate limiting, field allow-listing) and Phase 3's public-estimate-page pattern.

### Phase 8 — Technician PWA and offline sync

**Directly addresses:**
- `next-pwa` is installed but `runtimeCaching: []` — no real offline strategy exists today. This phase either builds real offline-mutation-queue support or makes a documented decision to keep the PWA "installable but online-only" and update the docs/roadmap to stop implying offline support exists.

### Phase 9 — Time, mileage, expenses, job costing

**Directly addresses:**
- Entirely new schema and UI; depends on Phase 2 money utilities and Phase 5's finalized work-order model for the costing rollup to mean anything.

### Phase 10 — Reporting platform, admin, white-label

**Directly addresses:**
- Financial reporting (currently entirely missing — only operational reporting exists and is genuinely solid).
- Platform-admin UI for `canManageTenants` (permission flag exists, checked in RLS, but no UI consumes it).
- `tenants.ghl_api_token_encrypted` is dead schema (never read/written) — this phase either activates real per-tenant encrypted GHL credentials (true white-label) or the column/claim should be corrected to reflect the single-shared-token reality.

### Phase 11 — Production readiness, security, QA, deployment

**Directly addresses:**
- CI pipeline (currently doesn't exist at all — no `.github/workflows/`).
- Final security-header/CSP verification, full test-matrix execution (`qa/test-matrix.md`), dependency-audit re-run and clean bill of health, launch-checklist sign-off per the existing `qa/launch-readiness-checklist.md` (already exists, needs updating for the new modules).

## Rollback strategy

- Every migration is additive (per non-negotiable rule #10) — rollback for a bad migration is a new forward-fixing migration, never an edit to an applied one.
- Feature flags gate any UI surface whose backend isn't fully wired yet (this Phase 0 audit found at least one precedent for the failure mode this prevents: the Stripe/estimate-token code was deployed with no reachable UI in front of it — a feature flag would have made that state visible instead of silently broken).
- Each phase branch (`feat/serviceops-phase-N-*`) is reviewed and its quality gates verified before merge; a phase that fails its completion gate does not block prior phases' already-merged work, since each phase's migrations/code are additive and independently revertible via a new branch + migration if needed.

## Feature flags needed

| Flag | Gates | Why |
|---|---|---|
| `pricebook_enabled` | Pricebook UI/API (Phase 2) | New module, needs staged rollout before estimates depend on it |
| `full_estimates_enabled` | New estimate document UI (Phase 3), replacing the current handoff-only queue | Must not break the existing, working technician estimate-flag flow during transition |
| `dispatch_calendar_enabled` | New calendar/dispatch UI (Phase 4) | Staged rollout alongside existing simple work-order scheduling fields |
| `change_orders_enabled` | Change-order workflow (Phase 5) | New customer-facing token surface |
| `invoices_admin_ui_enabled` | New invoice list/detail pages (Phase 6) | Backend already exists; flag lets UI ship independently and be verified against real data before wider exposure |
| `customer_portal_enabled` | Entire portal (Phase 7) | Highest-risk new public surface — must be able to kill-switch instantly |
| `offline_sync_enabled` | Technician offline mutation queue (Phase 8) | Data-integrity risk if conflict resolution has bugs; needs a fast off-switch |
| `platform_admin_enabled` | Cross-tenant admin UI (Phase 10) | Highest-privilege surface in the app |

## External approval gates (unchanged from the phase-prompt, restated for this plan)

Stop and get explicit owner approval before: any production Supabase migration, production deployment, live Stripe action, live customer email send, live GHL credential/workflow change, DNS change, merge to production/main, or any destructive production-data action. Phase 1's rate-limiter and audit-log work may require a new paid service (e.g. Upstash) — if so, stop at the credential/cost approval gate after the code path and fallback behavior are complete, per the phase-prompt's instruction.
