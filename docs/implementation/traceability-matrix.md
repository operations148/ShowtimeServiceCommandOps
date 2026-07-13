# Traceability Matrix — Requested Features → Phase / Exclusion

_Every capability named in `ServiceOps_Claude_Code_All_Phases.md` and `markate_report.md`'s capability catalog, mapped to the exact phase (or exclusion) that owns it. No requested feature is left unmapped._

| Requested capability | Owning phase | Status at Phase 0 | Notes |
|---|---|---|---|
| Trusted server-side authorization context (user/tenant/role/permissions/session-version/request-id) | Phase 1 | Missing | Currently: JWT claims only, no session-version, no request-id threading |
| Remove hardcoded tenant fallbacks | Phase 1 | N/A — none found | Confirmed clean in this audit; keep it that way |
| Global identity vs. tenant-slug identity model decision | Phase 1 | Undecided (flagged M18) | Needs an ADR before Phase 2 touches auth-adjacent code |
| Granular permissions (work-order/property/visit/schedule/estimate/invoice/payment/expense/time/reports/team/settings/audit/tenant) | Phase 1 | Missing (flat 9-flag model only) | |
| RLS policy review matching new permission model | Phase 1 | RLS exists but is inert (M1) | Needs explicit decision: keep RLS as documented-but-unreachable, or make it reachable |
| Session security (revocation, cookies, rate limiting, backoff, reset, token hashing, invite atomicity, password policy, MFA-readiness) | Phase 1 | Missing (H1, H2, M11, M12, L4) | MFA explicitly allowed to remain a documented blocker per phase-prompt |
| CSRF/origin/CORS/headers/CSP | Phase 1 | Missing entirely (M9, M10) | |
| Durable rate limiting | Phase 1 | Missing entirely | May require a new paid service — stop at approval gate if so |
| Audit logs (append-only, full catalog) | Phase 1 | Partial — `user_activity_log` exists, used narrowly (one call site: estimate-lock override) | Needs expansion to the full event catalog in the phase-prompt |
| Durable webhook/integration outbox | Phase 1 | Missing — GHL retry queue is in-memory (L7) | Stripe webhook is idempotent already; GHL is not durable |
| Webhook security (GHL constant-time, disable query-token in prod; Stripe already-correct) | Phase 1 | Partial (L1, and query-token mode is currently allowed in prod) | |
| File security (magic bytes, EXIF strip, safe names, signed URLs, exact ownership, cleanup) | Phase 1 | Missing most controls (M4, M5, M6, M7, L3) | |
| Structured logging, redaction, typed errors, health endpoints | Phase 1 | Missing (M14, M15; no logger module exists) | |
| CI/supply chain (lockfile, npm ci, lint, typecheck, tests, build, audit, secret scan, static analysis, migration checks, least-privilege Actions, Dependabot) | Phase 1 | Missing entirely — no `.github/workflows/` | |
| Schema reconciliation (estimates/invoices/payments/status enums) | Phase 2 | Two incompatible `InvoiceStatus` models confirmed (M17); untracked `invoices`/`user_invitations`/`invoice_line_items` tables | |
| Money utilities (cents, tax, discount, markup, rounding, deposit, margin) | Phase 2 | Partial — deposit math exists inline in `create-invoice-from-estimate.ts`, not a shared tested utility module | |
| Tenant-safe sequential numbering | Phase 2 | Partial — `wo_number` is a true DB identity (good); invoice numbering is app-layer `COUNT+1` (not concurrency-safe) | |
| Pricebook (items, categories, permissions, UI, snapshotting) | Phase 2 | Missing entirely | |
| Optimistic concurrency (row versioning) | Phase 2 | Missing entirely — no version column on any table | |
| Estimate document lifecycle + versioning/locking | Phase 3 | Partial — `estimate_handoffs` has a simpler 6-state flag machine; `locked_at` exists and is used; no version history | |
| Proposal options / package selection | Phase 3 | Missing | |
| Manual send with preview/test-recipient/send-log | Phase 3 | Partial — `send-estimate` route sends real email today with no preview/test-recipient mode, and (per H4) has a permission gap | |
| Secure public estimate route + acceptance transaction | Phase 3 | Missing (dead `accept_token` schema only; page doesn't exist) | |
| Estimate PDF | Phase 3 | Partial — pdfkit infrastructure exists (used for work-order reports), not yet applied to estimates | |
| Dispatch (assign/reassign/multi-tech/drag-drop/conflicts/audit) | Phase 4 | Missing | |
| Calendar views (day/week/month/team/map) | Phase 4 | Missing | |
| Timezone safety (DST, cross-midnight, all-day, recurring) | Phase 4 | Unverified/likely missing — no timezone-handling code found beyond a `timezone` field on `tenant_company_profile` | |
| Recurring work upgrade (blueprint, exceptions, pause/resume/skip) | Phase 4 | Partial — basic weekly/biweekly/monthly cron generation exists and is described as idempotent; no exception/pause/skip UI | |
| Visits admin page (real list/detail/timeline) | Phase 4 | Missing — confirmed static stub (`EmptyState` only, no data fetch) | See markate-gap-analysis.md |
| Route workflow (manual ordering, navigation deep links) | Phase 4 | Missing | |
| Cron reliability (fail-closed, idempotent, per-tenant result, retry, observable) | Phase 4 (extends Phase 1's fail-closed pattern) | Currently fails open (H3) | |
| Work-order project model (parent/child, multi-day, multi-visit, multi-tech, budget/actual) | Phase 5 | Missing | |
| Work-order state machine (formal, with archive/reopen/cancel) | Phase 5 | Partial — `WORK_ORDER_STATUS_TRANSITIONS` exists and is used consistently; no archive state, hard-delete is the only removal path (M3) | |
| Checklists (templates, conditional items, versioned immutable snapshot) | Phase 5 | Partial — templates + completion tracking exist; no versioning/immutable-snapshot-on-complete | |
| Completion requirements (configurable required fields) | Phase 5 | Missing — completion flow is currently hardcoded (checklist + notes prompt), not tenant-configurable | |
| Change orders (full workflow + public token) | Phase 5 | Missing entirely | |
| Completion report upgrade (change orders, signatures, tenant branding) | Phase 5 | Partial — PDF report exists (work order + checklist + photos + notes), no change-order/signature sections yet | |
| Invoice lifecycle consolidation | Phase 6 | Partial — one good `InvoiceStatus` model exists (`invoice.ts`), needs the dead second model removed (Phase 2) before extending | |
| Invoice sources (estimate/WO/change-order/manual/milestone/final) | Phase 6 | Partial — only "from accepted estimate" exists today | |
| Invoice functionality (full feature list) | Phase 6 | Partial — most fields exist in schema/types; no admin UI to view/manage any of it | |
| Payment ledger (immutable, full field list) | Phase 6 | Missing — payment state lives only as columns on `invoices` (`stripe_payment_intent_id`, `amount_paid`), no separate ledger table | |
| Stripe Connect (full requirements incl. reconciliation) | Phase 6 | Partial — direct-charge checkout + webhook exist and are individually well-built; no reconciliation tooling, no admin UI, redirect target page missing | |
| Customer portal (full spec) | Phase 7 | Missing entirely | |
| Technician PWA + offline sync | Phase 8 | Partial (installed, no offline data strategy) | |
| Time/mileage/expenses/job costing | Phase 9 | Missing entirely | |
| Reporting platform (financial + operational split, all report types) | Phase 10 | Partial (operational reporting genuinely complete; financial reporting missing) | |
| Platform admin dashboard | Phase 10 | Missing (permission flag exists, no UI) | |
| White-label readiness (per-tenant GHL credentials, branding) | Phase 10 | Partial (branding fields exist; per-tenant credential encryption column exists but unused) | |
| Production readiness (CI, full security verification, launch sign-off) | Phase 11 | Missing (no CI at all) | |
| AI voice reception | **Excluded** | Out of scope | ADR-0001 |
| Conversation AI | **Excluded** | Out of scope | ADR-0001 |
| Autonomous customer messaging / marketing automation | **Excluded** | Out of scope | ADR-0001 |
| Shopify | **Excluded** | Out of scope | ADR-0001 |
| Slack | **Excluded** | Out of scope | ADR-0001 |
| Integration marketplace | **Excluded** | Out of scope | ADR-0001 |
| Native mobile app | **Excluded** | Out of scope | ADR-0001 |
| Enterprise warehouse/inventory management | **Excluded** | Out of scope | ADR-0001; Markate itself doesn't have this either per `markate_report.md` |

Every row above maps to exactly one phase or exclusion — no requested capability is left unassigned, satisfying this phase's completion gate.
