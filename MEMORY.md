# MEMORY.md — ServiceOps Command Center

_Last updated: 2026-06-16 — Supabase DB live, GHL pipeline stages confirmed, PDF reports, expanded reporting, team/technician CRUD, invitations, recurring schedules, photo uploads, company settings, estimate→invoice→payment system (migration + types/queries + estimate locking done)._

## Product Identity
- **Name**: ServiceOps Command Center
- **Type**: GHL-integrated work order and field operations SaaS
- **First client**: Showtime Pool Service, California
- **Future vision**: White-label Jobber-style add-on for GHL users
- **GitHub repo**: https://github.com/Eriin2816/service-command-ops.git (initial commit pushed 2026-05-05)
- **Production URL**: https://serviceops-ghl-workorders.vercel.app

## Build Phase Status
| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Scaffold | ✅ Done |
| 1 | MVP UI Shell + Navigation | ✅ Done |
| 1b | Technician Mobile Shell (/tech/today) | ✅ Done |
| 2 | Work Order Module | ✅ Done (list + detail + New WO modal, API) |
| 3 | Property Profile Module | ✅ Done (types + list + detail + API + Add Property form) |
| 4 | Technician Mobile View (full) | ✅ Done (today list + job detail + checklist + visits API + completion flow + photo uploads) |
| 5 | GHL Webhook Intake | ✅ Done (HMAC verification ✅, OpportunityStatusChange ✅, QA script ✅, pipeline stages confirmed ✅) |
| 6 | Status Sync Back to GHL | ✅ Done (GHL client ✅, completion sync ✅, retry queue ✅, estimate task sync ✅) |
| 7 | Reporting Dashboard | ✅ Done (overview ✅, operations reports ✅, marketing reports ✅, owner reports ✅, VA reports ✅, tech performance ✅) |
| 8 | Authentication | ✅ Done (NextAuth + bcrypt + Supabase DB ✅, middleware ✅, role permissions ✅, tenant isolation audit ✅) |
| 9 | Full Database Migration (Supabase) | ✅ Done (18 migrations applied, all tables live, mock data stores retired) |
| 10 | Technicians & Team Management | ✅ Done (CRUD for technicians + office staff, add/edit/deactivate panels) |
| 11 | Email Invitations (Resend) | ✅ Done (invite flow, accept-invite page, resend-invite, email templates) |
| 12 | Recurring Service Schedules | ✅ Done (DB table, API CRUD, cron job `/api/cron/generate-visits`, ServiceScheduleCard) |
| 13 | Work Order Reports (PDF) | ✅ Done (pdfkit server-side, `/api/work-orders/[id]/report`, send-estimate via Resend) |
| 14 | Company Settings & Branding | ✅ Done (company profile, logo upload to Supabase Storage, avatar upload, GHL settings panel) |
| 15 | Estimate → Invoice → Payment System | 🔄 In Progress — migration (20260613000001_invoices.sql) applied ✅, src/types/invoice.ts ✅, src/lib/validation/invoice.ts ✅, src/lib/db/queries/invoices.ts ✅, estimate locking in PATCH /api/work-orders/[id] ✅, src/lib/invoicing/create-invoice-from-estimate.ts ✅ (idempotent, deposit_due, INV-XXXX), Stripe deposit-checkout + webhook ✅ (§8.2/§8.3). **Phase 0 audit correction (2026-07-11): this entire backend has ZERO callers anywhere in the app** — `createInvoiceFromEstimate` and `createDepositCheckoutSession` are never invoked, there is no `/dashboard/invoices` admin page (sidebar link 404s), and no `/estimate/[token]` public page exists (Stripe's own redirect targets it). Remaining: wire a real caller (estimate acceptance → createInvoiceFromEstimate), build the admin invoices page, build the public estimate/token page, reconcile the two incompatible `InvoiceStatus` type systems (`invoice.ts` live vs `estimate.ts` dead — see `docs/audits/security-audit.md` M17), verify `invoices`/`invoice_line_items`/`user_invitations` table grants (none have tracked migrations). See `docs/implementation/master-plan.md` Phase 2/3/6. |
| 16 | ContactCreate/ContactUpdate Webhooks | ✅ **Done — corrected 2026-07-11.** Prior "Not Started" status was stale. `src/app/api/ghl/webhooks/route.ts` dispatch switch calls `upsertPropertyFromGHL()` for real, with tenant resolution. |
| 17 | AppointmentBooked Webhook | ✅ **Done — corrected 2026-07-11.** Prior "Not Started" status was stale. Dispatch switch calls `createWorkOrderFromAppointment()`, idempotent via appointment-ID lookup. |
| 18 | GHL Retry Queue Persistence | ⏳ Not Started (currently in-memory only, needs DB table backing — reconfirmed by Phase 0 audit) |
| 19 | Multi-Tenant SaaS Hardening | ⏳ Not Started |
| 20 | QA and Launch | ⏳ Pending |
| 21 | Markate-Inspired Expansion — Phase 0 (Repository Audit) | ✅ Done 2026-07-11 — see `docs/audits/`, `docs/architecture/`, `docs/implementation/`, `memory/phase-0-audit.md`. 0 critical / 4 high security findings; master plan for Phases 1-11 established. |
| 22 | Markate-Inspired Expansion — Phase 1 (Security/Tenancy/Authorization Foundation) | ✅ Done 2026-07-11 — branch `feat/serviceops-phase-1-security`. Session revocation (session_version + trusted-context re-validation on every request), durable Postgres-backed rate limiting, durable GHL sync outbox (replaces in-memory retry-queue.ts), fail-closed cron, hashed+atomic invitation tokens, self-service password reset, magic-byte file validation + EXIF strip, security headers, CSRF/origin check, granular permission flags, CI pipeline + Vitest (neither existed before). See `docs/security/security-controls.md` for the full finding→control map and `memory/phase-1-security-foundation.md`. RLS reachability, MFA, and the untracked invoices/user_invitations migrations remain deliberately deferred (documented). Phase 2 (core data model, money utilities, pricebook) is next. |
| 23 | Markate-Inspired Expansion — Phase 2 (Core Data Model, Money, Pricebook) | ✅ Done 2026-07-11 — branch `feat/serviceops-phase-2-pricebook`. Schema reconciliation (dead `src/types/estimate.ts` deleted; `src/types/invoice.ts` is THE invoice model; untracked `invoices`/`invoice_line_items` now have tracked baselines), authoritative money module (`src/lib/money/money.ts` — integer cents, half-up float-safe rounding, proportional tax-base discount allocation), tenant-safe atomic document numbering (`document_sequences` + `next_document_number()`, both `COUNT(*)+1` sites replaced), full pricebook (3 tables, 9 API routes, 6 permission flags, server-side `internal_cost` redaction, soft archive, optimistic concurrency 409s, injection-safe CSV export — import deferred), immutable line-item snapshot foundation, `/dashboard/pricebook` UI. Migration `20260711000002` additive, NOT applied to live DB. ADR-0005/0006, `specs/pricebook.md`, `database-blueprint/pricebook.md`, `docs/architecture/target-state.md`. Phase 3 (full estimates/proposals/approval) is next. |
| 24 | Markate-Inspired Expansion — Phase 3 (Full Estimates, Proposals, Secure Approval) | ✅ Done 2026-07-12 — branch `feat/serviceops-phase-3-estimates`. NEW `estimates`/`estimate_line_items`/`estimate_versions`/`estimate_events` tables (migration `20260711000003`, additive, NOT applied to live DB); `estimate_handoffs` technician flag preserved (kept as a "Needs Estimate" tab). One 9-state machine; server-computed totals from selected lines (reuses money module); optional/package lines with one-per-option-group. First unauthenticated surface: `/estimate/[token]` + `/api/public/estimates/*` — 256-bit token hashed at rest, expiry/revoke, IP rate-limit, generic errors, strict `PublicEstimate` allowlist redaction (no cost/internal-notes/GHL/tenant). Transactional idempotent accept/decline (atomic status+version claim); accepted-version immutable snapshot; idempotent estimate→DRAFT-invoice conversion (partial `UNIQUE(invoices.estimate_id)`). Manual send via safe mailer (preview default / test-recipient override / live behind `ESTIMATE_EMAIL_MODE`); send log + retry. Permissioned+reasoned+audited override. Proposal PDF from the redacted view. Admin UI (list/filter/create/edit/detail/send/activity/versions/override/void/PDF). ADR-0007/0008, `specs/estimates.md`, `database-blueprint/estimates.md`, `qa/estimate-test-plan.md`, `memory/phase-3-estimates.md`. Phase 4 (scheduling/dispatch) is next. |
| 25 | Markate-Inspired Expansion — Phase 4 (Dispatch, Calendar, Visit Admin, Recurring) | ✅ Done 2026-07-12 — branch `feat/serviceops-phase-4-dispatch`. Migration `20260712000001` (additive; one deliberate index drop; NOT applied to live DB): `tenants.timezone`; visit scheduling columns (planned times/arrival window/duration/travel buffer/all-day/route order/version/GHL appt ref + sync state); `visit_assignments` (multi-tech, lead mirrored on `visits.technician_id`); `blocked_time`; `technician_availability`; `recurring_exceptions`; `schedule_events` audit; `cron_runs`; `UNIQUE(recurring_schedule_id, scheduled_date)` for duplicate-proof generation; dropped optional `idx_visits_one_active_per_wo`. Pure tested primitives in `src/lib/scheduling/`: timezone (UTC↔tenant-local, DST 23h/25h, cross-midnight, all-day — 17 tests), recurrence (weekly/biweekly/monthly + pause + exceptions, deterministic — 12), conflicts/capacity (non-blocking warnings — 11). Optimistic concurrency (409) on assign/reschedule/pause. Dispatch calendar `/dashboard/schedule` (week/day, DnD + keyboard reschedule, unassigned/overdue panels, conflict warnings). Visits admin `/dashboard/visits` (list/filter/search + rich detail) replaces the placeholder. Recurring cron rewritten to use the shared modules + tenant tz, honoring pause/exceptions, 23505-as-skip idempotent, `cron_runs` observability + per-tenant isolation, still fails closed. `canViewSchedule`/`canManageSchedule` perms (+ existing `canAssignTechnicians`); technicians own-visit scoped. GHL owns original booking; ServiceOps owns operational scheduling (ADR-0009). Route optimization / paid geocoding deferred (none approved). ADR-0009, `specs/dispatch-and-scheduling.md`, `specs/visits.md`, `database-blueprint/scheduling.md`, `docs/operations/recurring-job-runbook.md`, `qa/scheduling-test-plan.md`, `memory/phase-4-dispatch-visits.md`. Phase 5 (work-order expansion, multi-visit projects, change orders) is next. |
| 26 | Markate-Inspired Expansion — Phase 5 (Work-Order Projects, Multi-Visit, Change Orders) | ✅ Done 2026-07-13 — branch `feat/serviceops-phase-5-work-orders`. Migration `20260713000001` (additive; extends `work_order_status` enum from 7→11 values via `ADD VALUE IF NOT EXISTS`; NOT applied to live DB): 14 new `work_orders` columns (parent/child, multi-day, budget/contract/actual-cost cents, archive/close/reopen metadata, version); `work_order_tasks`, `work_order_attachments` + `_attachment_rules`; `checklist_templates` + `_items`; `visit_checklist_snapshots`; 5 new completion-capture columns on `visits`; `completion_requirement_rules`; new `change_order_status` enum + `change_orders`/`change_order_line_items`/`_versions`/`_events` (mirrors the estimate document shape). `src/lib/security/public-document-token.ts` + `src/lib/pdf/pdf-text.ts` promoted out of `src/lib/estimates/` to shared, domain-neutral homes the moment change orders needed the identical logic. One 11-state work-order machine (`src/lib/work-orders/state-machine.ts`, 15 tests) — `archived` is a marker settable from any status via dedicated archive/restore actions, ORTHOGONAL to `status=ARCHIVED` (state-machine-terminal, reachable only from closed/cancelled); `closeWorkOrder`/`reopenWorkOrder` are separate version-gated actions, and close is blocked by any pending `blocks_closeout=true` change order (`findBlockingChangeOrderIds`, 409 + ids). One 7-state change-order machine (12 tests) mirroring estimates' shape; totals (7 tests) sum ALL lines (no optional/selection logic, unlike estimates); public serializer redaction (9 tests) proves no cost/tenant/staff leak. Change-order acceptance atomically bumps the parent WO's `approved_contract_amount_cents` by `price_impact_cents` in the SAME request (ADR-0011); rejection/void never touch it; override re-opens to draft but does NOT auto-reverse an already-applied contract value (corrective change order is the documented path). Schedule impact is the opposite of contract value: recorded on accept but NEVER auto-applied — a separate `canApplyScheduleImpact`-gated action pushes it onto one named visit via Phase 4's `rescheduleVisit`. Tenant-configured `completion_requirement_rules` (10 tests) gate visit completion BEFORE the write (422 if unmet, no partial state); an immutable `visit_checklist_snapshots` row is written the moment a visit completes, capturing the resolved template+version so later template edits can't retroactively alter completed-visit history. Completion-report PDF upgraded: approved change orders, materials, time, signature, tenant branding (phone/email), all values through the shared `pdfText()` sanitizer; gated behind `canViewAllWorkOrders` + financial figures further gated behind `canViewFinancialReports`. Admin UI: change-order list embedded per-work-order (no tenant-wide list endpoint by design — every CO belongs to exactly one WO) + create/edit/detail/send/override/void/apply-schedule-impact at `/dashboard/change-orders/[id]`; WorkOrderDetail.tsx additions (archive/close/reopen buttons, parent/child project display + add-visit, tasks panel, attachments panel, change-orders panel, contract-value sidebar). Public change-order page `/change-order/[token]` mirrors the public estimate page (typed-name approval, no option-group/selection UI since every CO line always counts). **4 pre-existing hardcoded `"tenant-showtime"` fallback defaults found and closed** during this phase (`listWorkOrders`, `createWorkOrder`, `updateVisit`, `listVisits`) — all were dead in practice (every caller already passed tenant_id) but real tenant-isolation hazards; **1 real permission gap found and closed** (PATCH `/api/work-orders/[id]/tasks/[taskId]` let any non-technician role edit any task with zero permission check — now requires `canManageWorkOrderTasks`). ADR-0010/0011, `specs/work-order-projects.md`, `specs/change-orders.md`, `database-blueprint/change-orders.md`, `qa/change-order-test-plan.md`, `memory/phase-5-work-orders-change-orders.md`. Deferred (documented, not gate blockers): checklist-template/completion-requirement/attachment-rule admin settings UI (routes fully functional, no dedicated screen), job-costing rollup into `actual_cost_cents`, `/transition` re-open path back to draft for rejected/expired COs (override is the only wired unlock today). Phase 6 is next — see `ServiceOps_Claude_Code_All_Phases.md`. |
| 27 | Markate-Inspired Expansion — Phase 6 (Invoices, Stripe Connect Payments, Ledger, Reconciliation) | ✅ Done 2026-07-13 — branch `feat/serviceops-phase-6-invoices-payments`. Migration `20260714000001` (additive; extends `invoice_status` enum 5→12 via `ADD VALUE IF NOT EXISTS`; **NOT applied to live DB yet** — Phase 6 not deployed). Consolidated the old 5-state invoice model into ONE 12-state machine (`src/lib/invoices/state-machine.ts` + `INVOICE_STATUS_TRANSITIONS`, 20 tests): draft⇄ready→sent→viewed→deposit_due→partially_paid→paid, plus overdue/void/refunded/credited; `deposit_paid` is legacy (bridged out, never set by new code); void is unpaid-only, refund/credit once money moved. **Immutable payment ledger** (`payments` table, ADR-0012): append-only payment/refund/credit rows, idempotent by partial unique index on provider_payment_intent_id/provider_refund_id/idempotency_key; `applyPayment/Refund/Credit` re-aggregate the ledger and write ledger-true sums onto the invoice (self-healing under concurrency/replay); status is a PURE function of aggregates (`deriveStatusAfterLedgerChange`), gated by the machine for reachability; no card data stored. **Stripe Connect** (ADR-0013): Express accounts, direct charge (tenant = merchant of record); onboarding + live status; checkout sessions with SERVER-OWNED amount/currency/invoice/tenant metadata for deposit AND balance; refunds. **Webhook rewrite**: receipt+dedup on event.id, tenant-from-connected-account, `verifyCheckoutSession` (pure, 9 tests: forged metadata/wrong account/wrong currency/forged amount), ledger writes, charge.refunded handling, TERMINAL-vs-TRANSIENT split (verification fail→done+200 so Stripe stops; DB error→500 so Stripe retries; stuck `error` rows = dead-letter reconciliation surfaces). **Public pay page** `/invoice/[token]` + `/api/public/invoices/[token]`(view)+`/pay` — same hashed-token security as estimates/COs, redacted `PublicInvoice` (6-case redaction test), reads only `payment_type` (amount server-owned). Invoice sources: manual (`/dashboard/invoices/new`), accepted estimate (Phase 3's convertEstimateToInvoice, unchanged), work order (`POST /api/work-orders/[id]/invoices` standard/milestone/final), accepted change order (`POST /api/change-orders/[id]/invoice`) — all stamp an immutable `source_snapshot`; totals ALWAYS server-computed. **Reconciliation** (`runReconciliation`): daily cron + admin trigger; ledger⇄invoice + ledger⇄Stripe cross-checks, overdue aging, dead-letter surfacing; per-tenant findings with mandatory resolution reason. Admin UI: invoices list (`/dashboard/invoices`, fixes the 404 sidebar link + missing Receipt icon), detail (send/void/mark-ready/PDF/pay-link + record-payment/refund/credit + ledger + activity), Stripe settings panel, "Create Invoice" on accepted COs. New `canViewInvoices` read flag (view/manage split); manage=canManageInvoices, refund=canRefundPayments, send=canSendEstimateEmail, onboard=canManageSettings, reconcile=canViewFinancialReports; matrix pinned in roles.test.ts. **2 hand-added-column migration gaps found + fixed + APPLIED TO PRODUCTION this session** (`users.avatar_url` 20260714000002 — was breaking login on the from-migrations DB; `tenants.logo_url` 20260714000003 — breaks company settings + estimate/CO/invoice send branding lookups). ADR-0012/0013, `specs/invoices-and-payments.md`, `database-blueprint/payments.md`, `docs/operations/stripe-runbook.md`, `qa/payments-test-plan.md`, `memory/phase-6-invoices-payments.md`. 311 total tests. Deferred: 2nd payment provider (forbidden), real email/charge default (preview-gated), WO milestone-billing UI (API exists), reconciliation-findings admin screen (API complete). **NOT merged/deployed** — to ship: merge to master, apply migration `20260714000001`, set STRIPE test keys + webhook endpoint, deploy (reconcile-payments cron already in vercel.json). |

## Tech Stack (Confirmed — All Decisions Locked)
- **Framework**: Next.js 15, App Router — no Pages Router ever
- **Language**: TypeScript strict mode — no `any`
- **Styling**: Tailwind CSS only — no inline styles, no custom CSS unless unavoidable
- **UI components**: shadcn/ui-compatible pattern (Radix primitives approach)
- **Icons**: lucide-react
- **Class utility**: `cn()` from `clsx` + `tailwind-merge` — lives in `src/lib/utils/index.ts`
- **Fonts**: `Sora` (display/headings) + `Plus Jakarta Sans` (body) via `next/font/google`
- **Database**: Supabase PostgreSQL ✅ LIVE — 18 migrations applied. Service role client (`supabaseAdmin`) in `src/lib/db/client.ts`. Query layer in `src/lib/db/queries/`. Mock data stores RETIRED.
- **Auth**: NextAuth.js v4 — CredentialsProvider + bcrypt + Supabase `users` table. JWT strategy, 8-hour maxAge. `src/lib/auth/config.ts`. Session carries `id`, `role`, `tenant_id`, `technician_id?`, `avatar_url?`. Role permissions via `requirePermission(flag)` in `api-auth.ts`.
- **Email**: Resend — `src/lib/email/resend.ts`. Used for invitations and estimate emails.
- **PDF**: pdfkit (Node.js native CJS) — server-side only. Listed in `serverExternalPackages` in `next.config.ts`. Used by `/api/work-orders/[id]/report`.
- **Charts**: recharts — used in reporting dashboards.
- **Payments**: Stripe — packages installed (`stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`). API routes and webhooks not yet wired. Env vars missing (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`).
- **PWA**: next-pwa — installed, `InstallPromptBanner.tsx` component active.
- **File storage**: Supabase Storage ✅ CONFIRMED — photo uploads (`STORAGE_BUCKET` env), avatar uploads (`AVATAR_BUCKET=avatars` env). `src/lib/storage/photos.ts` + `src/lib/storage/avatars.ts`.
- **Deployment**: Vercel ✅ LIVE.
- **GHL auth**: Private Integration Token ✅ CONFIRMED — `GHL_PRIVATE_INTEGRATION_TOKEN` set in Vercel. Not OAuth.

## Brand / Design Tokens (Established Phase 1)
- **Sidebar bg**: `#0C1E2E` (deep ocean navy)
- **Primary accent**: cyan — `brand-500` = `#06B6D4`
- **Warning/estimate accent**: amber — `amber-500` = `#F59E0B`
- **Content bg**: `bg-background` = slate-50 via CSS var
- **Card bg**: white with `border border-border shadow-sm rounded-xl`

## Status Badge Color Map
| Status | Badge classes |
|--------|--------------|
| new | `bg-slate-100 text-slate-600` |
| assigned | `bg-blue-50 text-blue-700` |
| in_progress | `bg-brand-50 text-brand-700` |
| completed | `bg-emerald-50 text-emerald-700` |
| needs_follow_up | `bg-orange-50 text-orange-700` |
| estimate_needed | `bg-amber-50 text-amber-700` |
| cancelled | `bg-red-50 text-red-500` |

## Priority Badge Color Map
| Priority | Badge classes |
|----------|--------------|
| low | `bg-slate-100 text-slate-500` |
| normal | `bg-slate-100 text-slate-600` |
| high | `bg-orange-50 text-orange-600` |
| urgent | `bg-red-50 text-red-600` |

## GHL Pipeline Stages — CONFIRMED for Showtime Pool Service (2026-05-15)
These are the **exact** stage name strings in GHL webhook payloads. All comparisons case-insensitive. Source: `src/lib/constants/ghl-pipeline.ts`.

| Stage Name | Action in ServiceOps |
|-----------|----------------------|
| `New Lead` | No action — lead stage, not job-ready |
| `Diagnosis Booked` | ✅ **Creates new work order** |
| `Diagnosis Completed` | Updates WO status → `completed` |
| `Estimate Sent` | Flags estimate handoff |
| `Review Estimate` | No action |
| `Estimate Approved` | ✅ **Creates new work order** |
| `Invoice Sent` | No action |
| `Invoice Paid` | No action |
| `In Progress` | Updates WO status → `in_progress` |
| `Completed/Won` | Updates WO status → `completed` + outbound `PUT /opportunities/{id} { status: "won" }` |

`GHL_JOB_READY_STAGES` env = `"Diagnosis Booked,Estimate Approved,In Progress"` (SET in Vercel).

## Database Tables — All Confirmed Live (Supabase)

| Migration File | Table / Action |
|---------------|---------------|
| 20260506000001 | All enums created (status, role, priority, category) |
| 20260506000002 | `tenants` |
| 20260506000003 | `users` (id, email, name, role, tenant_id, is_active, avatar_url) |
| 20260506000004 | `properties` (address, pool_equipment JSONB, ghl_contact_id, gate_code, access_notes) |
| 20260506000005 | `work_orders` (ghl_opportunity_id, ghl_trigger_stage, status, priority, service_category, etc.) |
| 20260506000006 | `visits` (checklist JSONB, estimate_flagged, photo_urls JSONB, technician_notes) |
| 20260506000007 | `checklist_items` |
| 20260506000008 | `technician_notes` |
| 20260506000009 | `photos` (visit_id, url, uploaded_by) |
| 20260506000010 | `estimate_handoffs` |
| 20260506000011 | Row Level Security policies — all tables |
| 20260506000012 | `password_hash` column added to `users` |
| 20260506000013 | `property_id` made nullable on `work_orders` |
| 20260513000001 | `tenant_company_profile` (name, logo_url, timezone, contact info) |
| 20260514000001 | `recurring_schedules` (property_id, frequency, service_category, assigned_tech) |
| 20260514000002 | `work_order_status_history` (work_order_id, from_status, to_status, changed_by, timestamp) |
| 20260515000001 | `user_activity_log` (user_id, action_type, description, entity_type, entity_id — NO metadata column) |
| 20260613000001 | `invoices` additive columns (estimate_handoff_id, deposit_*, stripe_checkout_session_id); `estimate_handoffs` additive columns (accept_token, accept_token_expires_at, locked_at, locked_by); `tenants` Stripe Connect columns (stripe_account_id, stripe_charges_enabled, stripe_onboarding_completed_at); `invoice_status` enum; RLS policies for invoices |
| 20260515000003 | `ghl_trigger_stage` column added to `work_orders` |

**DB access pattern**: `supabaseAdmin` (service role, bypasses RLS) for all server-side API routes. Tenant isolation enforced at application layer via `getTenantId(session)`. RLS is defense-in-depth.

## Confirmed Decisions (Phase 15 — Estimate → Invoice → Payment)
- **Architecture**: `estimate_handoffs` = GHL-sync state machine layer; `estimates` table = financial document layer. Both coexist, linked via `work_order_id`. `estimate_handoffs` is the lock authority.
- **Estimate locking**: `locked_at` on `estimate_handoffs`. PATCH `/api/work-orders/[id]` rejects `estimate_handoff_status` mutations with HTTP 409 `{ error: "Estimate is locked" }` when `locked_at` is set, UNLESS caller is TENANT_ADMIN/PLATFORM_OWNER with `{ override: true }` in body.
- **Override field**: `override?: boolean` added to `PatchWorkOrderSchema` — not passed to DB, extracted before `fullDbPatch`.
- **Activity log on override**: `user_activity_log` insert (fire-and-forget) — `action_type: "estimate.lock_override"`, `entity_type: "estimate_handoff"`, `entity_id: handoff.id`, `description: "before: {status}, after: {new_status}"`.
- **No unlock path**: Locking is permanent unless overridden per-request. There is no unlock endpoint.
- **Invoice money**: All amounts in integer cents. `deposit_percent` minimum 10% enforced by both Zod and DB CHECK constraint.
- **Invoice number**: `INV-XXXX` generated via `COUNT(*)+1` tenant-scoped, optimistic.
- **`INVOICE_STATUS_TRANSITIONS`**: Authoritative state machine in `src/types/invoice.ts`. Import everywhere; never hardcode transitions.
- **Idempotency**: `markDepositPaid` idempotent on `stripe_payment_intent_id` — if already `deposit_paid` with same intent ID, returns current row unchanged.
- **user_activity_log columns** (actual DB): `tenant_id`, `user_id`, `action_type`, `description`, `entity_type`, `entity_id` (UUID). NO `metadata` column. Description carries before/after context as a string.
- **`createInvoiceFromEstimate`**: `src/lib/invoicing/create-invoice-from-estimate.ts`. Pure-ish, returns `{ outcome: 'created' | 'already_exists' | 'error'; invoice? }`. Never throws. deposit_percent = 10, deposit_amount = round(total * 0.10), status = deposit_due, sent_at = NOW. Idempotency: pre-check via `getInvoiceByEstimateHandoffId` + UNIQUE(estimate_handoff_id) race catch (23505 → re-fetch → already_exists). Optional `line_items` array snapshotted into `invoice_line_items`. Invoice number: `INV-${count+1 padStart(4,'0')}`.
- **`invoices` table grant bug**: The `invoices` table was created via Supabase SQL Editor without auto-grants. `service_role` gets "permission denied". Fix: run migration `20260617000001_grant_invoices_service_role.sql` in Supabase SQL Editor (`GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO service_role;`). All other tables (created via `supabase db push`) are unaffected.

## Confirmed Decisions (Phase 9 — Supabase Migration)
- **Mock data stores retired**: `src/lib/mock-data/` is no longer used by API routes. All data goes through `src/lib/db/queries/`.
- **Auth upgraded**: `src/lib/auth/config.ts` now does real bcrypt + Supabase DB lookup — NOT hardcoded demo users. Users live in the `users` table with `password_hash` (bcrypt).
- **`technician_id` in session**: For TECHNICIAN role, `session.user.technician_id = session.user.id` (user ID IS the technician ID in this schema).
- **Supabase client files**:
  - `src/lib/db/client.ts` — `db` (supabaseAdmin, service role)
  - `src/lib/db/supabase.ts` — exports `supabaseAdmin` alias + anon key `supabase`
  - `src/lib/db/browser.ts` — `createBrowserClient()` for React client components
- **DB typing approach**: Untyped `createClient<any>` — type safety via explicit casts in `src/lib/db/queries/*.ts`. Avoids fighting Supabase v2 auto-generated type inference.

## Confirmed Decisions (Phase 8 — Authentication — UPDATED)
- **Provider**: NextAuth.js v4 with CredentialsProvider. JWT session strategy, 8-hour maxAge.
- **Authorize flow** (PRODUCTION): queries Supabase `users` table by email (`is_active = true`), verifies `password_hash` with `bcrypt.compare`. No hardcoded credentials in production.
- **Session shape**: `session.user` carries `id`, `role` (`UserRole`), `tenant_id`, `technician_id?`, `avatar_url?`. Typed via `src/types/next-auth.d.ts` declaration merging.
- **Route protection via middleware** (`src/middleware.ts`): `withAuth` wrapper. Matcher: `/dashboard/:path*`, `/tech/:path*`, `/login`. Unauthenticated → `/login?callbackUrl=...`. TECHNICIAN on `/dashboard/*` → `/tech/today`. Authenticated on `/login` → role-appropriate home.
- **Role-appropriate home**: TECHNICIAN → `/tech/today`; everyone else → `/dashboard/overview`.
- **Login page** (`/login`): split-screen — left navy branding panel (dot-grid, feature pills, client badge), right form (email + password, cyan submit). Error shown inline. Security events logged via `console.warn`.
- **`NEXTAUTH_SECRET`**: required. SET in Vercel.

## Confirmed Decisions (Phase 8 — Tenant Isolation Audit)

### getTenantId helper
- **File**: `src/lib/auth/tenant.ts` — `getTenantId(session: Session): string`
- **Rule**: Every API route calls this immediately after auth. Throws if `tenant_id` missing — prevents silent wrong-tenant fallback. NEVER use `session.user.tenant_id` directly.
- **Re-exported** from `src/lib/auth/api-auth` (routes) and `src/lib/auth/index.ts` (server components).

### Webhook route exception
`POST /api/ghl/webhooks` — HMAC/Bearer-verified service-to-service endpoint. Resolves `tenant_id` from `GHL_LOCATION_TO_TENANT` env map. No session auth applies.

## Confirmed Decisions (Phase 4 — Tech Mobile)
- **Server/client split on job detail**: `page.tsx` = server (fetches WO, property, checklist template, creates visit). `JobDetail.tsx` = `'use client'` (all interactive state).
- **Visit created server-side on page load**: `getOrCreateVisit(workOrderId, ...)` is idempotent per `(work_order_id, tenant_id)`. Visit ID passed to client as prop.
- **JobDetail state machine**: 6 phases: `idle → warn_incomplete → submitting → done_complete` OR `idle → estimate_prompt → submitting → done_estimate`.
- **Completion confirmation**: full-page replacement (not a banner). Shows checked/total items, notes flag, timestamp. "Back to Today's Jobs" only action.
- **Checklist template fallback**: `FALLBACK_ITEMS` (6 generic items) used for `equipment_installation`, `new_construction`, `pool_inspection_diagnostic`, `other`.

## Confirmed Decisions (Phase 3 — Properties)
- **Equipment storage**: `pool_equipment` stored as JSONB — one snapshot, not history.
- **`ghl_contact_id` is optional**: properties can exist without GHL link.
- **`gate_code`**: separate field, shown in amber badge.
- **Soft delete only**: `is_active = false` — never hard-delete.

## Confirmed Decisions (Phase 2 — Work Orders)
- **WO number format**: `WO-XXXX` — 4-digit zero-padded. Auto-expands past 9999.
- **Status transitions**: codified in `WORK_ORDER_STATUS_TRANSITIONS` in `src/types/work-order.ts`. Never hardcode elsewhere.

## Confirmed Decisions (Phase 6 — Outbound GHL Sync)
- **Fire-and-forget pattern**: `void syncCompletionToGhl(updatedWo)` — not awaited. TODO: wrap with `waitUntil()` in serverless.
- **Trigger**: `updatedWo.status === COMPLETED` checked against stored result, not PATCH body.
- **No GHL link → silent skip**: `syncCompletionToGhl` returns if `ghl_opportunity_id` is null.
- **Failure sequence**: log → `enqueueGhlSync` → set `ghl_sync_failed: true`. Success → clear flag.
- **Retry queue**: in-memory only (`src/lib/ghl/retry-queue.ts`). Lost on restart. Needs DB persistence before production reliability is guaranteed.
- **Estimate sync trigger**: `estimate_flagged` false→true in PATCH `/api/visits/[id]`. WO updated synchronously (`ESTIMATE_NEEDED` + `FLAGGED`), then fire-and-forget `syncEstimateToGhl`. GHL task: "Estimate Needed — [address]", due +24h, assignee = `GHL_DEFAULT_OFFICE_USER_ID`.

## Confirmed Decisions (Phase 7 — Reporting Dashboard)

### Overview Dashboard (`/dashboard/overview`)
- Fetches `/api/reports/summary` + `/api/work-orders` in parallel.
- Today's schedule: sorted by `scheduled_time_start`, capped at 5, `"99:99"` sentinel for unscheduled.
- Status breakdown bars: `scaleX()` transform animated via double-rAF (respects "only animate transform/opacity").
- All 4 sections have `animate-pulse` skeleton placeholders.

### Reports Page (`/dashboard/reports`)
- Date range picker: This Week | This Month | Custom. Defaults to This Month.
- `/api/reports/range`: `date_from` + `date_to` pair (YYYY-MM-DD), `from ≤ to` enforced. Returns `by_status[]` (all 7, zero-filled), `by_category[]` (non-zero only), `by_technician[]`.
- Print-optimized: A4 portrait, print-only header with company name + date range.
- Additional report tabs: Marketing Performance (`/reports/marketing`), Owner Performance (`/reports/owner`), VA Performance (`/reports/va`), Tech Performance via `/api/reports/tech-performance`.

### Live reporting mode
- `NEXT_PUBLIC_REPORTING_MODE=live` (SET in Vercel) — pulls live GHL data via `src/lib/ghl/reporting-service.ts`.
- `APP_ENV=development` locally forces mock data — never pollutes live GHL.
- Reporting data cached via `src/lib/ghl/reporting-cache.ts`. Refresh endpoint: `/api/reports/refresh`.

## Confirmed Decisions (Phase 13 — PDF Reports)
- **pdfkit**: Node.js native, server-side only. Must be in `serverExternalPackages` in `next.config.ts` to preserve internal `require()` calls for font data.
- **Route**: `GET /api/work-orders/[id]/report` — auth required, tenant-scoped. Returns binary PDF via `Content-Type: application/pdf`.
- **Send Estimate**: `POST /api/work-orders/[id]/send-estimate` — sends formatted estimate email via Resend to customer. Updates `estimate_handoff_status → ESTIMATE_SENT`.

## Confirmed Decisions (Phase 12 — Recurring Schedules)
- **DB table**: `recurring_schedules` — `property_id`, `frequency` (weekly/bi_weekly/monthly/etc.), `service_category`, `assigned_technician_id`, `day_of_week`, `time_of_day`, `is_active`.
- **Cron job**: `GET /api/cron/generate-visits` — protected by `Authorization: Bearer <CRON_SECRET>`. Reads active schedules, generates visits for the current week if not already created.
- **`ServiceScheduleCard.tsx`**: displays next scheduled visit on property detail page.

## Confirmed Decisions (Phase 11 — Email Invitations)
- **Resend**: all email sent via `src/lib/email/resend.ts`. `RESEND_API_KEY` + `RESEND_FROM_EMAIL` SET in Vercel.
- **Invite flow**: `POST /api/team` creates pending user + sends invite email. `GET /accept-invite/[token]` validates token + lets user set password. `POST /api/invitations/accept` completes registration.
- **Resend invite**: `POST /api/team/[id]/resend-invite`.

## Confirmed Decisions (Phase 10 — Technicians & Team)
- **Technicians page**: `TechniciansPageClient.tsx` → `TechniciansList.tsx` + `NewTechnicianModal.tsx` + `EditTechnicianPanel.tsx`. CRUD via `/api/technicians/` + `/api/technicians/[id]`.
- **Team page**: `TeamPageClient.tsx` → `TeamMembersList.tsx` + `NewTeamMemberModal.tsx` + `EditTeamMemberPanel.tsx`. CRUD via `/api/team/` + `/api/team/[id]`.
- **Avatar upload**: `POST /api/profile/avatar` — multipart form, uploads to `avatars` Supabase Storage bucket, returns URL, updates `users.avatar_url`.

## Component Architecture (Current)
### Layout — `src/components/layout/`
- `DashboardShell.tsx` — client, manages `mobileNavOpen`
- `Sidebar.tsx` — server-compatible, ocean-navy
- `SidebarNavItem.tsx` — `'use client'`, `usePathname()` for active state
- `TopBar.tsx` — `'use client'`, hamburger + `NotificationDropdown` + `ProfilePanel`
- `MobileNav.tsx` — `'use client'`, slide-in drawer, Escape + scroll lock
- `TechShell.tsx` — mobile-only `/tech/*` layout
- `Breadcrumb.tsx` — server component
- `NotificationDropdown.tsx` — `'use client'`, bell icon menu
- `ProfilePanel.tsx` — `'use client'`, avatar + account options
- `InstallPromptBanner.tsx` — PWA install prompt

### Dashboard — `src/components/dashboard/`
- `StatCard.tsx`, `WorkOrdersTable.tsx`, `WorkOrdersPageClient.tsx`, `WorkOrderDetail.tsx`
- `NewWorkOrderModal.tsx`, `NewWorkOrderButton.tsx`
- `PropertiesTable.tsx`, `PropertiesPageClient.tsx`, `PropertyDetail.tsx`
- `NewPropertyModal.tsx`, `NewPropertyButton.tsx`
- `OverviewDashboard.tsx`, `ReportsDashboard.tsx`
- `EstimatesPageClient.tsx`
- `TechniciansList.tsx`, `TechniciansPageClient.tsx`, `NewTechnicianModal.tsx`, `EditTechnicianPanel.tsx`
- `TeamMembersList.tsx`, `TeamPageClient.tsx`, `NewTeamMemberModal.tsx`, `EditTeamMemberPanel.tsx`
- `SettingsPageClient.tsx`
- `ServiceScheduleCard.tsx`

### Reporting — `src/components/reporting/`
- `ReportingTabs.tsx`, `MetricCard.tsx`, `TrendChart.tsx`, `PerformanceTable.tsx`
- `TechPerformanceTable.tsx`, `ConversionFunnel.tsx`, `SourceBreakdown.tsx`
- `DateRangeFilter.tsx`, `LoadingSkeleton.tsx`, `EmptyState.tsx`, `ErrorState.tsx`

### Tech Mobile — `src/components/tech/`
- `JobDetail.tsx` — full state machine, 6 phases
- `TechHeader.tsx`

### Auth / Provider
- `src/components/providers/SessionProvider.tsx` — wraps `next-auth/react` SessionProvider

## Route Structure (Current)
```
src/app/
  page.tsx                              → redirect to /dashboard/overview
  layout.tsx                            → root layout, fonts, SessionProvider
  login/page.tsx + LoginForm.tsx        → ✅ split-screen login
  accept-invite/[token]/page.tsx        → ✅ email invite acceptance
  dashboard/
    layout.tsx                          → DashboardShell
    overview/page.tsx                   → ✅ OverviewDashboard
    work-orders/page.tsx                → ✅ list + filters
    work-orders/[id]/page.tsx           → ✅ detail + status + estimate flag
    properties/page.tsx                 → ✅ list + search + filter
    properties/[id]/page.tsx            → ✅ detail + inline edit + equipment
    technicians/page.tsx                → ✅ CRUD list
    team/page.tsx                       → ✅ CRUD list + invitations
    estimates/page.tsx                  → ✅ estimates queue
    visits/page.tsx                     → ✅ visits list
    reports/page.tsx                    → ✅ operations reports
    reports/marketing/page.tsx          → ✅ marketing performance
    reports/owner/page.tsx              → ✅ owner performance
    reports/va/page.tsx                 → ✅ VA performance
    settings/page.tsx                   → ✅ company settings + GHL settings
    ai-knowledge/page.tsx               → stub
  tech/
    layout.tsx                          → TechShell
    today/page.tsx                      → ✅ today's jobs (real Supabase data)
    job/[id]/page.tsx                   → ✅ server: visit + WO + checklist
    job/[id]/JobDetail.tsx              → ✅ client: full state machine
  api/
    auth/[...nextauth]/route.ts         → ✅ NextAuth handler
    work-orders/route.ts                → ✅ GET + POST
    work-orders/[id]/route.ts           → ✅ GET + PATCH + DELETE
    work-orders/[id]/history/route.ts   → ✅ GET status history
    work-orders/[id]/report/route.ts    → ✅ GET PDF (pdfkit)
    work-orders/[id]/send-estimate/     → ✅ POST send estimate email
    properties/route.ts                 → ✅ GET + POST
    properties/[id]/route.ts            → ✅ GET + PATCH
    visits/route.ts                     → ✅ GET + POST
    visits/[id]/route.ts                → ✅ GET + PATCH
    visits/[id]/photos/route.ts         → ✅ POST photo upload
    technicians/route.ts                → ✅ GET + POST
    technicians/[id]/route.ts           → ✅ GET + PATCH + DELETE
    team/route.ts                       → ✅ GET + POST (with invite)
    team/[id]/route.ts                  → ✅ GET + PATCH + DELETE
    team/[id]/resend-invite/route.ts    → ✅ POST
    recurring-schedules/route.ts        → ✅ GET + POST
    recurring-schedules/[id]/route.ts   → ✅ GET + PATCH + DELETE
    reports/summary/route.ts            → ✅ GET — KPI summary
    reports/range/route.ts              → ✅ GET — date-filtered breakdown
    reports/marketing-performance/      → ✅ GET
    reports/owner-performance/          → ✅ GET
    reports/va-performance/             → ✅ GET
    reports/tech-performance/           → ✅ GET
    reports/refresh/route.ts            → ✅ POST cache refresh
    settings/company/route.ts           → ✅ GET + PATCH company profile
    settings/company/logo/route.ts      → ✅ POST logo upload
    profile/avatar/route.ts             → ✅ POST avatar upload
    notifications/route.ts              → ✅ GET
    invitations/accept/route.ts         → ✅ POST
    ghl/webhooks/route.ts               → ✅ POST (HMAC/Bearer + dispatch)
    ghl/webhooks/health/route.ts        → ✅ GET health check
    ghl/test-connection/route.ts        → ✅ GET GHL connectivity test
    cron/generate-visits/route.ts       → ✅ GET (CRON_SECRET protected)
```

## GHL Integration Layer (`src/lib/ghl/`)
- **`client.ts`**: `Authorization: Bearer <token>` + `Version: 2021-07-28`. Retry max 3, on `{429,500,502,503,504}`. Exponential backoff + jitter. Respects `Retry-After`. 204 → `data: null`. Exports `updateOpportunity`, `createTask`, `ghlFetch<T>`.
- **`tenant-config.ts`**: `resolveTenantId(locationId)` from `GHL_LOCATION_TO_TENANT` env. `resolveGhlUserToTechId(ghlUserId)` from `GHL_USER_TO_TECHNICIAN` env. Both return `undefined` on missing — never throw.
- **`map-opportunity.ts`**: Pure mapping. `mapGhlStatus`, `mapServiceCategoryFromStageName`, `extractOppCustomField` (reads `fieldValue`), `parseGhlDate`, `parseGhlTime`, `mapGhlPriority`, `isJobReadyStage`.
- **`create-work-order-from-ghl.ts`**: 7-step orchestrator. Returns `CreateWorkOrderFromGHLResult` discriminated union. Nothing throws.
- **`work-order-factory.ts`**: WO creation using confirmed stage names from `ghl-pipeline.ts`.
- **`upsert-property-from-ghl.ts`**: ContactCreate/ContactUpdate handler — **EXISTS but NOT WIRED to webhook dispatch**.
- **`create-work-order-from-appointment.ts`**: AppointmentBooked handler — **EXISTS but NOT WIRED to webhook dispatch**.
- **`sync-completion.ts`**: Fire-and-forget completion sync. `syncCompletionToGhl(workOrder)`.
- **`sync-estimate.ts`**: Fire-and-forget estimate task. `syncEstimateToGhl(visit)`.
- **`retry-queue.ts`**: In-memory only. `enqueueGhlSync`, `getQueueDepth`, `getQueueSnapshot`. Needs DB persistence.
- **`reporting-service.ts`** + **`reporting-aggregator.ts`** + **`reporting-cache.ts`**: Live GHL reporting pipeline.
- **`ghl-api.ts`**: Additional GHL API helpers.

## GHL Types (`src/types/ghl.ts`)
- Discriminated union of 11 concrete payload interfaces.
- `GHLContactCustomField`: `{id, value}` — contact events.
- `GHLOpportunityCustomField`: `{id, fieldValue}` — opportunity events (DIFFERENT key name).
- `GHLWebhookEventType` derived from `GHLWebhookPayload["type"]`.
- Webhook dispatch switch uses TypeScript exhaustiveness — compile error if new type added without handler.

## Validation Schemas (`src/lib/validation/`)
- `work-order.ts` — `NewWorkOrderSchema` + `PatchWorkOrderSchema`
- `property.ts` — `CreatePropertySchema` + `PatchPropertySchema` + equipment sub-schemas
- `visit.ts` — `CreateVisitSchema` + `PatchVisitSchema` + `ChecklistItemSchema`
- `technician.ts` — technician CRUD schemas
- `recurring-schedule.ts` — schedule CRUD schemas

## Key Coding Patterns (Always Follow)
- `cn()` from `@/lib/utils` for all conditional classNames
- `usePathname()` for active nav — always in `'use client'` components
- Dashboard pages: `export const metadata: Metadata = { title: "..." }` for tab titles
- **Next.js 15 params**: `params` is `Promise<{ id: string }>` — must `await params`. Both `generateMetadata` and page function await independently.
- **API auth pattern**:
  ```ts
  const auth = await requireApiAuth();           // or requirePermission("canXxx")
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);    // throws if missing
  // pass tenantId to every DB query
  ```
- **Response shape**: `{ data: T }` success; `{ error, issues? }` validation; `{ error }` 404/400.
- **TECHNICIAN scoping**: `isTechnicianScoped(session)` — auto-scope list queries to own `technician_id`.
- **Zod schemas**: `src/lib/validation/` — `Create*Schema` + `Patch*Schema`. Types via `z.infer<>`.
- **Breadcrumb**: `<Breadcrumb items={[...]} className="mb-2" />` at top of every dashboard page.
- **Status/priority badges**: `rounded-full px-2.5 py-0.5 text-xs font-medium` + color map classes.
- **Filter controls**: `'use client'` wrapper holds state; receives full data as prop from server page.

## Work Order Types (`src/types/work-order.ts`)
- `WorkOrderStatus`: new, assigned, in_progress, completed, needs_follow_up, estimate_needed, cancelled
- `Priority`: low, normal, high, urgent
- `ServiceCategory`: 10 values — weekly_pool_maintenance, pool_repair, pool_inspection_diagnostic, filter_cleaning, heater_service, equipment_installation, pool_remodel, new_construction, emergency_service, other
- `EstimateHandoffStatus`: not_needed, flagged, sent_to_ghl, estimate_sent, approved, declined
- `WorkOrder.ghl_sync_failed?: boolean` — set on failed outbound sync, cleared on success
- `WORK_ORDER_STATUS_TRANSITIONS` — always use for validation, never hardcode

## Visit Types (`src/types/visit.ts`)
- `VisitStatus`: scheduled, in_progress, completed, skipped, rescheduled, cancelled
- `ChecklistItem`: id, label, completed, notes?
- `Visit`: id, tenant_id, work_order_id, property_id, technician_id?, status, scheduled_date, checklist, technician_notes?, photo_urls, completed_at?, estimate_flagged, created_at, updated_at

## Dependencies Installed (package.json)
- `next` 15, `react` 18, `typescript` 5, `tailwindcss` 3.4
- `@supabase/supabase-js` ^2.105.3
- `next-auth` ^4.24.14 — CredentialsProvider, JWT
- `bcryptjs` ^3.0.3 + `@types/bcryptjs`
- `zod` v4
- `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`
- `resend` ^6.12.3
- `pdfkit` ^0.18.0 + `@types/pdfkit`
- `recharts` ^3.8.1
- `stripe` ^22.2.0, `@stripe/stripe-js` ^9.7.0, `@stripe/react-stripe-js` ^6.4.0 — **installed, NOT YET WIRED**
- `next-pwa` ^5.6.0 — PWA support
- `date-fns` ^4.1.0
- `dotenv` ^17.4.2
- `@radix-ui/react-tabs` ^1.1.13

## GHL Boundaries (Non-Negotiable)
**GHL owns**: CRM, contacts, conversations, lead pipelines, calendars, SMS/email, marketing automations, forms.
**ServiceOps owns**: work orders, visits, property profiles, technician workflow, checklists, photos, notes, completion reports, recurring schedules, estimate handoffs.
Never store full GHL contact objects — reference by `ghl_contact_id` / `ghl_opportunity_id` only.

## Confirmed Client Context
- **Client**: Showtime Pool Service, California
- **Current stack**: GoHighLevel (Private Integration Token confirmed)
- **Service type**: Pool service (weekly maintenance, repairs, emergency, equipment installs, remodels)
- **Team**: Owner + technicians in the field
- **GHL Pipeline**: 10 stages confirmed (see table above)
- **Photo storage**: Supabase Storage (confirmed)
- **Technician app**: Mobile web (confirmed, not native app for MVP)
- **Recurring visits**: Internal cron scheduler (confirmed, not GHL calendar sync for MVP)
- **Estimate handoff**: Creates GHL task (confirmed, not a pipeline stage change)

## Open Questions (Remaining — Unresolved)
1. Which GHL plan does Showtime use? (affects API rate limits and feature access)
2. GHL custom field IDs for `gate_code`, `access_notes`, `service_notes`, `scheduled_date`, `service_category`, `priority` — must retrieve from client's GHL account before ContactCreate webhooks can be wired
3. GHL calendar ID → service category mapping for AppointmentBooked events (`GHL_CALENDAR_TO_SERVICE_CAT` env map values)
4. Does the client want customer email/SMS notifications via GHL when a job is completed? (would trigger GHL automation from ServiceOps)
5. How many technician accounts need to be seeded in the Supabase `users` table?
6. Is there an existing property/customer address list to import? (bulk migration)
7. Stripe: is billing per-technician seat, flat monthly, or usage-based?
8. `waitUntil()` wrapper — confirm deployment target (Vercel Edge vs Node.js runtime) to implement correctly

## Resolved Questions (For Reference)
- ~~GHL auth: Private Integration Token or OAuth?~~ → **Private Integration Token** ✅
- ~~Photo storage: Supabase Storage, AWS S3, or Cloudinary?~~ → **Supabase Storage** ✅
- ~~Recurring visits: internal or GHL calendar sync?~~ → **Internal cron** ✅
- ~~Estimate handoff: new opportunity or update existing?~~ → **Create GHL task** ✅
- ~~Technician app: mobile web or native?~~ → **Mobile web for MVP** ✅
- ~~Database: Supabase or other?~~ → **Supabase PostgreSQL** ✅
- ~~Auth: NextAuth or Supabase Auth?~~ → **NextAuth v4 + bcrypt + Supabase users table** ✅
- ~~Deployment: Vercel or other?~~ → **Vercel** ✅
- ~~GHL pipeline stage names for Showtime?~~ → **10 stages confirmed 2026-05-15** ✅

## Detailed Memory Files Location
- `memory/product-decisions.md` — architecture and product decisions
- `memory/confirmed-facts.md` — confirmed client/business facts
- `memory/assumptions.md` — unconfirmed working assumptions
- `memory/glossary.md` — term definitions
- `memory/client-showtime-pools.md` — client-specific notes
- `memory/ghl-rules.md` — GHL integration rules
- `memory/technical-decisions.md` — tech stack decisions (needs update — see MEMORY.md for current confirmed state)
- `memory/open-questions.md` — questions to resolve (see this file for current state)
