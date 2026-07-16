# ServiceOps Command Center — Project Handoff

_Generated: 2026-06-11. This document is the single source of truth for a new Claude session to continue development with zero prior context._

---

## What This Project Is

ServiceOps Command Center is a GHL-integrated work order and field operations SaaS, built first for **Showtime Pool Service** (California). It plugs into GoHighLevel via webhooks and private integration API to receive job-ready data, create work orders, route jobs to field technicians, and push status updates back to GHL when a job is completed or an estimate is needed. The long-term vision is a white-label Jobber-style add-on sold to local service businesses (pool service, HVAC, landscaping, plumbing) already using GoHighLevel. The app is **live in production** at `https://serviceops-ghl-workorders.vercel.app`.

- **GitHub repo**: https://github.com/Eriin2816/service-command-ops.git
- **Client repo (Markate expansion)**: https://github.com/operations148/ShowtimeServiceCommandOps
- **Production URL**: https://serviceops-ghl-workorders.vercel.app
- **Project root**: `serviceops-ghl-workorders-scaffold/serviceops-ghl-workorders/`

---

## Markate-Inspired Expansion Status (read this first — newer than the sections below)

The July 2026 expansion (phased plan in `docs/implementation/master-plan.md`) supersedes the older status sections in this document where they conflict. Nothing below this section has been rewritten; trust `MEMORY.md` rows 21-23 and the phase memory files for current truth.

| Phase | Status | Branch | Key artifacts |
|---|---|---|---|
| 0 — Repository audit | ✅ 2026-07-11 | `feat/phase-0-audit` | `docs/audits/*`, `docs/implementation/master-plan.md`, `memory/phase-0-audit.md` |
| 1 — Security/tenancy/authorization foundation | ✅ 2026-07-11 | `feat/serviceops-phase-1-security` | `docs/security/security-controls.md`, ADR-0002/3/4, `qa/security-test-plan.md` |
| 2 — Core data model, money, pricebook | ✅ 2026-07-11 | `feat/serviceops-phase-2-pricebook` | `src/lib/money/`, `document_sequences`, pricebook (API + `/dashboard/pricebook`), ADR-0005/6, `specs/pricebook.md`, `docs/architecture/target-state.md` |
| 3 — Full estimates/proposals/secure approval | ✅ 2026-07-12 | `feat/serviceops-phase-3-estimates` | `src/lib/estimates/*`, estimates tables, `/dashboard/estimates` + `/estimate/[token]`, ADR-0007/8, `specs/estimates.md`, `database-blueprint/estimates.md` |
| 4 — Dispatch, calendar, visit admin, recurring | ✅ 2026-07-12 | `feat/serviceops-phase-4-dispatch` | `src/lib/scheduling/*`, scheduling tables, `/dashboard/schedule` + `/dashboard/visits`, ADR-0009, `specs/dispatch-and-scheduling.md`, `docs/operations/recurring-job-runbook.md` |
| 5 — Work-order expansion, multi-visit projects, change orders | ✅ 2026-07-13 | `feat/serviceops-phase-5-work-orders` | 11-state WO lifecycle + archive/close/reopen, parent/child projects, tasks/attachments, checklist templates + immutable completion snapshots, tenant completion-requirement gate, full change-order workflow (`/dashboard/change-orders/[id]` + `/change-order/[token]`), ADR-0010/11, `specs/work-order-projects.md`, `specs/change-orders.md`, `database-blueprint/change-orders.md`, `memory/phase-5-work-orders-change-orders.md` |
| 6 — Invoices, Stripe Connect payments, ledger, reconciliation | ✅ code-complete 2026-07-13 (branch, **not merged/deployed**) | `feat/serviceops-phase-6-invoices-payments` | 12-state invoice machine, immutable payment ledger (ADR-0012), Stripe Connect Express/direct-charge + server-owned amounts (ADR-0013), webhook rewrite (verify + terminal/transient split), public pay page `/invoice/[token]`, admin invoices UI `/dashboard/invoices`, reconciliation cron+admin, `specs/invoices-and-payments.md`, `database-blueprint/payments.md`, `docs/operations/stripe-runbook.md`, `qa/payments-test-plan.md`, `memory/phase-6-invoices-payments.md`. **To deploy**: merge→master, apply migration `20260714000001`, set STRIPE test keys + webhook endpoint. |

**Migration-history hotfixes applied to production this session** (both hand-added columns never captured in tracked migrations, breaking a from-migrations DB): `users.avatar_url` (`20260714000002` — was breaking login) and `tenants.logo_url` (`20260714000003` — breaks company settings + document-send branding). The production DB (`yyjbfjnpmjcraehecbvi`) now has Phases 0–5 applied + these two hotfixes; Phase 6's `20260714000001` is NOT yet applied.

**Standing facts a new session must know** (details in `docs/architecture/target-state.md`):
- All money math goes through `src/lib/money/money.ts` (integer cents); document numbers through `nextDocumentNumber()` — never `COUNT(*)+1`. Document line items are immutable snapshots (`createLineItemSnapshot`); estimate/invoice totals are computed server-side from selected lines and never trusted from the client.
- `src/types/invoice.ts` is the ONLY invoice model; `src/types/estimate.ts` is now the REAL migrated estimate document model (Phase 3), not the old dead file (which was deleted in Phase 2).
- `internal_cost`/`unit_cost` are server-redacted for roles without `canViewItemCosts`; the public estimate route redacts via an allowlist type (`PublicEstimate`) so internal fields structurally cannot leak.
- Estimate customer emails are gated: `ESTIMATE_EMAIL_MODE` defaults to `preview` (no real send). `live` is the external-action approval gate. Public estimate links use a hashed token (ADR-0007).
- Migrations `20260711000001`/`0002`/`0003` and `20260712000001` are written but **not applied to the live DB** — application requires explicit approval.
- Every authenticated request re-validates auth against the DB via the trusted context (`src/lib/auth/trusted-context.ts`); rate limiting and the GHL sync retry queue are Postgres-backed. The public estimate routes are the only unauthenticated surface (token is the credential).
- **All schedule time math goes through `src/lib/scheduling/timezone.ts`** — UTC storage, tenant-local display (`tenants.timezone`), calendar dates as strings. GHL owns the original booking; ServiceOps owns operational scheduling/dispatch (ADR-0009). Recurring generation is idempotent (duplicate-proof via `UNIQUE(recurring_schedule_id, scheduled_date)`) and observable (`cron_runs`).

---

## Tech Stack Confirmed

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15, App Router, TypeScript strict — no Pages Router ever |
| Database | Supabase PostgreSQL (service role key, app-layer tenant isolation) |
| Auth | NextAuth.js v4 — CredentialsProvider + bcrypt + Supabase `users` table, JWT strategy, 8h sessions |
| Styling | Tailwind CSS only — no inline styles. `Sora` (headings) + `Plus Jakarta Sans` (body) via `next/font/google` |
| Icons | lucide-react |
| Class utility | `cn()` from `clsx` + `tailwind-merge` — lives in `src/lib/utils/index.ts` |
| Email | Resend (`src/lib/email/resend.ts`) |
| PDF | pdfkit — server-side, Node.js native, listed in `serverExternalPackages` |
| Charts | recharts |
| Payments | Stripe — packages installed (`stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`), **not yet wired** |
| PWA | next-pwa (installed) |
| Validation | Zod v4 — schemas in `src/lib/validation/` |
| Deployment | Vercel |
| GHL Integration | Private Integration Token (NOT OAuth, NOT marketplace app) |

---

## Environment Variables Status

All of the following are **SET in Vercel production**. For local dev, copy `.env.example` → `.env.local` and fill in values; set `APP_ENV=development` locally to force mock reporting data.

| Variable | Status | Notes |
|----------|--------|-------|
| `NEXT_PUBLIC_APP_NAME` | SET | App display name |
| `NEXT_PUBLIC_APP_URL` | SET | `https://serviceops-ghl-workorders.vercel.app` |
| `GHL_API_BASE_URL` | SET | `https://services.leadconnectorhq.com` |
| `GHL_PRIVATE_INTEGRATION_TOKEN` | SET | `pit-0bf9...` — GHL Settings → Private Integrations. **Never put in GHL workflow config** |
| `GHL_LOCATION_ID` | SET | `E4iish4R...` — Showtime's GHL location |
| `NEXT_PUBLIC_GHL_LOCATION_ID` | SET | Same as above — safe to expose, used in Settings display only |
| `GHL_WEBHOOK_SECRET` | SET | Random secret we created. Goes in GHL workflow Custom Webhook header only |
| `GHL_LOCATION_TO_TENANT` | SET | JSON map: `{"<locationId>": "<tenantId>"}` |
| `GHL_USER_TO_TECHNICIAN` | SET | JSON map: `{"<ghlUserId>": "<technicianId>"}` |
| `GHL_DEFAULT_OFFICE_USER_ID` | SET | GHL user assigned to estimate tasks |
| `GHL_JOB_READY_STAGES` | SET | `"Diagnosis Booked,Estimate Approved,In Progress"` |
| `NEXT_PUBLIC_REPORTING_MODE` | SET | `live` (production) — set to `mock` locally |
| `NEXT_PUBLIC_SUPABASE_URL` | SET | `https://YOUR_REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | SET | Subject to RLS — safe for browser |
| `SUPABASE_SERVICE_ROLE_KEY` | SET | Bypasses RLS — server-side only, never expose to browser |
| `SUPABASE_URL` | SET | Legacy alias for `NEXT_PUBLIC_SUPABASE_URL` |
| `NEXTAUTH_SECRET` | SET | Generate: `openssl rand -base64 32` |
| `NEXTAUTH_URL` | SET | Must match deployment URL exactly |
| `STORAGE_BUCKET` | SET | Supabase Storage bucket for job photos |
| `AVATAR_BUCKET` | SET | `avatars` — Supabase Storage bucket |
| `RESEND_API_KEY` | SET | From resend.com |
| `RESEND_FROM_EMAIL` | SET | Verified sender domain in Resend |
| `CRON_SECRET` | SET | Protects `/api/cron/*` endpoints |
| `APP_ENV` | DEV ONLY | Set to `development` locally to block live GHL writes |
| `DATABASE_URL` | NOT USED | Placeholder in `.env.example`; Supabase vars used instead |
| `GHL_CLIENT_ID` | NOT USED | Placeholder; using Private Token, not OAuth |
| `GHL_CLIENT_SECRET` | NOT USED | Placeholder; using Private Token, not OAuth |
| `STRIPE_SECRET_KEY` | MISSING | Not yet configured — needed for Stripe phase |
| `STRIPE_PUBLISHABLE_KEY` | MISSING | Not yet configured |
| `STRIPE_WEBHOOK_SECRET` | MISSING | Not yet configured |

---

## Database Tables Confirmed Created

All migrations live in `supabase/migrations/`. Applied in order:

| Migration | Table / Action | Status |
|-----------|---------------|--------|
| 20260506000001 | `CREATE TYPE` enums (all status/role/priority/category enums) | ✅ |
| 20260506000002 | `tenants` | ✅ |
| 20260506000003 | `users` (id, email, name, role, tenant_id, is_active, avatar_url) | ✅ |
| 20260506000004 | `properties` (address, equipment JSONB, ghl_contact_id, gate_code, access_notes) | ✅ |
| 20260506000005 | `work_orders` (ghl_opportunity_id, status, priority, service_category, etc.) | ✅ |
| 20260506000006 | `visits` (checklist JSONB, estimate_flagged, photo_urls, technician_notes) | ✅ |
| 20260506000007 | `checklist_items` | ✅ |
| 20260506000008 | `technician_notes` | ✅ |
| 20260506000009 | `photos` (visit_id, url, uploaded_by) | ✅ |
| 20260506000010 | `estimate_handoffs` | ✅ |
| 20260506000011 | Row Level Security policies on all tables | ✅ |
| 20260506000012 | `password_hash` column added to `users` | ✅ |
| 20260506000013 | `property_id` made nullable on `work_orders` | ✅ |
| 20260513000001 | `tenant_company_profile` (name, logo_url, timezone, etc.) | ✅ |
| 20260514000001 | `recurring_schedules` (property_id, frequency, service_category, assigned_tech) | ✅ |
| 20260514000002 | `work_order_status_history` (work_order_id, from_status, to_status, changed_by) | ✅ |
| 20260515000001 | `user_activity_log` (user_id, action, resource_type, resource_id, metadata) | ✅ |
| 20260515000003 | `ghl_trigger_stage` column added to `work_orders` | ✅ |

**DB query layer**: `src/lib/db/queries/` — all API routes use these, NOT in-memory mock stores (mock stores are retired in production).

---

## GHL Integration Status

| Item | Value |
|------|-------|
| Token type | Private Integration Token |
| Token prefix | `pit-0bf9...` (SET in Vercel) |
| Location ID | `E4iish4R...` (SET in Vercel) |
| Webhook URL | `https://serviceops-ghl-workorders.vercel.app/api/ghl/webhooks` |
| Webhook auth | GHL workflow Custom Webhook header: `Authorization: Bearer <GHL_WEBHOOK_SECRET>` |
| Webhook secret | Separate from the integration token — random value we created |

### Events Handled (Inbound)

| Event Type | Handler | Status |
|-----------|---------|--------|
| `OpportunityStatusChange` | `create-work-order-from-ghl.ts` | ✅ Wired |
| `ContactCreate` | Property upsert handler | ❌ NOT YET WIRED |
| `ContactUpdate` | Property upsert handler | ❌ NOT YET WIRED |
| `AppointmentBooked` | WO from appointment | ❌ NOT YET WIRED |

### Pipeline Stages Mapped (CONFIRMED for Showtime Pool Service)

These are the **exact** stage name strings confirmed with the client (2026-05-15). All comparisons are case-insensitive. See `src/lib/constants/ghl-pipeline.ts`.

| Stage | Action |
|-------|--------|
| New Lead | No action — lead stage, not job-ready |
| **Diagnosis Booked** | Creates new work order |
| Diagnosis Completed | Updates WO status → `completed` |
| Estimate Sent | Flags estimate handoff |
| Review Estimate | No action |
| **Estimate Approved** | Creates new work order |
| Invoice Sent | No action |
| Invoice Paid | No action |
| **In Progress** | Updates WO status → `in_progress` |
| **Completed/Won** | Updates WO status → `completed`, pushes `PUT /opportunities/{id} { status: "won" }` to GHL |

### Outbound Sync (ServiceOps → GHL)

| Trigger | GHL Action | File |
|---------|-----------|------|
| WO status → `completed` | `PUT /opportunities/{id}` with `{ status: "won" }` | `src/lib/ghl/sync-completion.ts` |
| Visit `estimate_flagged` false→true | `POST /opportunities/{id}/tasks` ("Estimate Needed — [address]", due +24h) | `src/lib/ghl/sync-estimate.ts` |

---

## Features Completed ✅

### Core Infrastructure
- Next.js 15 App Router scaffold with TypeScript strict mode
- Tailwind CSS theme with brand tokens (ocean navy `#0C1E2E`, cyan `#06B6D4`)
- Dashboard shell: Sidebar, TopBar, MobileNav, Breadcrumb
- Route protection middleware (`src/middleware.ts`) — role-based redirects
- NextAuth v4 with bcrypt + Supabase DB user lookup (production-ready)
- Tenant isolation: `getTenantId(session)` enforced on every API route
- Supabase client (service role + anon key, `src/lib/db/supabase.ts`)
- DB query layer in `src/lib/db/queries/`
- Zod validation schemas for all API inputs (`src/lib/validation/`)

### Work Orders
- Work order list with status + category filters (`WorkOrdersTable.tsx`)
- Work order detail page with all fields, status transitions, estimate flag
- New Work Order modal (slide-over drawer, Zod validated, 6s success banner)
- Work order status history log (`/api/work-orders/[id]/history`)
- PDF report generation via pdfkit (`/api/work-orders/[id]/report`)
- Send estimate email via Resend (`/api/work-orders/[id]/send-estimate`)
- Status transition rules in `WORK_ORDER_STATUS_TRANSITIONS` (`src/types/work-order.ts`)

### Properties
- Properties list with real-time search + active/inactive filter
- Property detail with inline edit per section, pool equipment sub-forms
- Add Property modal (9 fields, gate code amber badge, success screen)
- Soft delete only (`is_active = false`)

### Technician Mobile View
- Today's job list (mobile-optimized, sorted by scheduled time)
- Job detail: access card (amber), checklist (interactive + progress bar), notes
- Full state machine: `idle → warn_incomplete → submitting → done_complete/done_estimate`
- Estimate prompt bottom sheet with notes textarea
- Full-page completion confirmation (green=complete, amber=estimate)
- Photo uploads wired to Supabase Storage (`/api/visits/[id]/photos`)

### GHL Integration
- Inbound webhook endpoint with HMAC/Bearer verification
- OpportunityStatusChange → create/update work order (7-step orchestrator)
- Outbound completion sync (fire-and-forget, retry queue in-memory)
- Outbound estimate task sync (fire-and-forget)
- GHL API client with retry + exponential backoff (`src/lib/ghl/client.ts`)
- Confirmed pipeline stage constants (`src/lib/constants/ghl-pipeline.ts`)
- GHL test connection endpoint (`/api/ghl/test-connection`)

### Reporting
- Overview dashboard: KPI cards, today's schedule, status breakdown bars, overdue alert list
- Reports page: date range picker (This Week / This Month / Custom), status/category/technician tables
- Marketing performance report (`/dashboard/reports/marketing`)
- Owner performance report (`/dashboard/reports/owner`)
- VA performance report (`/dashboard/reports/va`)
- All reports print-optimized (A4, `@media print`)
- Live GHL data mode (`NEXT_PUBLIC_REPORTING_MODE=live`)

### Team & Technicians
- Technicians page: list, add technician modal, edit panel, deactivate
- Team (office staff) page: list, add team member modal, edit panel
- Email invitation system (Resend) with accept-invite flow (`/accept-invite/[token]`)
- Resend invite for pending invitations

### Settings
- Company profile editor (name, logo, timezone, contact info)
- Company logo upload to Supabase Storage
- GHL connection settings panel
- User profile + avatar upload (`/api/profile/avatar`)

### Other Infrastructure
- Notification dropdown (bell icon in TopBar)
- PWA install prompt banner (`InstallPromptBanner.tsx`)
- Recurring service schedules API + cron job (`/api/cron/generate-visits`)
- Service schedule card component
- User activity logging

---

## Features In Progress 🔄

1. **Stripe Payments** — packages installed (`stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`). No API routes, webhooks, or UI wired yet. Env vars missing. This is the next logical phase.

2. **ContactCreate/ContactUpdate webhook handlers** — Only `OpportunityStatusChange` is wired. `ContactCreate`/`ContactUpdate` → property upsert (`src/lib/ghl/upsert-property-from-ghl.ts` exists but not called from webhook dispatch).

3. **AppointmentBooked webhook handler** — `src/lib/ghl/create-work-order-from-appointment.ts` exists but not connected to webhook dispatch.

4. **GHL retry queue persistence** — `src/lib/ghl/retry-queue.ts` is in-memory only. Lost on server restart. Needs backing by `work_order_sync_queue` DB table or Redis before production is reliable.

5. **`ghl_sync_failed` flag in UI** — The flag is set on `work_orders` when GHL sync fails after retries, but it is not yet surfaced as a warning badge in the admin dashboard.

6. **AI Knowledge Base** — `/dashboard/ai-knowledge/page.tsx` is a stub/placeholder page.

---

## Features Planned But Not Started ⏳

- Multi-tenant SaaS hardening (onboarding flow, tenant isolation for new signups)
- White-label tenant billing (Stripe subscription per tenant)
- GHL Marketplace App listing (OAuth flow instead of private token)
- Route optimization / dispatch board
- Customer-facing portal
- Native mobile apps
- AI voice (GHL missed-call text-back style)
- Inventory management
- Comprehensive invoicing module
- Automated review request trigger (job complete → GHL automation)

---

## Current Bugs / Known Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| Retry queue is in-memory only | Medium | `src/lib/ghl/retry-queue.ts` — items lost on restart. Won't affect correctness if app stays warm, but could lose sync events under cold starts |
| `waitUntil()` not added to fire-and-forget GHL calls | Low | In serverless, the PATCH response returns before GHL sync completes. Works now, but could be truncated under load. Add `waitUntil(syncCompletionToGhl(...))` in PATCH route |
| `ghl_sync_failed` not surfaced in UI | Low | Flag is stored on `work_orders` but no admin alert shown |
| ContactCreate/ContactUpdate webhooks not handled | Medium | Properties must be manually created or imported; GHL contact webhooks are ignored |
| AI Knowledge Base page is a stub | Low | `/dashboard/ai-knowledge` renders a placeholder |

---

## File Structure Key Files

```
serviceops-ghl-workorders/
├── CLAUDE.md                          ← Project mission, coding rules, what NOT to build
├── MEMORY.md                          ← Full project history and all technical decisions
├── SETUP_NOTES.md                     ← Production env vars, GHL webhook setup guide
├── HANDOFF.md                         ← This file
├── PRODUCT_BRIEF.md                   ← High-level product brief
├── ROADMAP.md                         ← Phase-by-phase roadmap
├── .env.example                       ← All env var names with comments
├── supabase/migrations/               ← All DB schema migrations (18 files)
├── src/
│   ├── middleware.ts                  ← Route protection + role-based redirects
│   ├── app/
│   │   ├── layout.tsx                 ← Root layout, fonts, SessionProvider
│   │   ├── page.tsx                   ← Redirects to /dashboard/overview
│   │   ├── login/                     ← Split-screen login page + LoginForm client
│   │   ├── accept-invite/[token]/     ← Email invite acceptance flow
│   │   ├── dashboard/                 ← All admin pages
│   │   │   ├── overview/              ← KPI dashboard
│   │   │   ├── work-orders/           ← List + detail pages
│   │   │   ├── properties/            ← List + detail pages
│   │   │   ├── technicians/           ← Technician CRUD
│   │   │   ├── team/                  ← Office staff CRUD
│   │   │   ├── estimates/             ← Estimates queue
│   │   │   ├── reports/               ← Reporting tabs
│   │   │   ├── settings/              ← Company + GHL settings
│   │   │   └── ai-knowledge/          ← Stub
│   │   ├── tech/                      ← Technician mobile shell
│   │   │   ├── today/                 ← Today's jobs list
│   │   │   └── job/[id]/              ← Job detail + checklist
│   │   └── api/
│   │       ├── auth/[...nextauth]/    ← NextAuth handler
│   │       ├── work-orders/           ← CRUD + history + report + send-estimate
│   │       ├── properties/            ← CRUD
│   │       ├── visits/                ← CRUD + photos
│   │       ├── technicians/           ← CRUD
│   │       ├── team/                  ← CRUD + resend-invite
│   │       ├── recurring-schedules/   ← CRUD
│   │       ├── reports/               ← summary, range, marketing, owner, va, tech-performance
│   │       ├── settings/company/      ← Company profile + logo upload
│   │       ├── profile/avatar/        ← Avatar upload
│   │       ├── invitations/accept/    ← Invite acceptance
│   │       ├── notifications/         ← Notification list
│   │       ├── ghl/webhooks/          ← Inbound GHL webhook handler
│   │       ├── ghl/test-connection/   ← GHL connectivity check
│   │       └── cron/generate-visits/  ← Cron: auto-generate visits from schedules
│   ├── components/
│   │   ├── layout/                    ← DashboardShell, Sidebar, TopBar, MobileNav, TechShell, Breadcrumb
│   │   ├── dashboard/                 ← All admin page components
│   │   ├── tech/                      ← JobDetail (state machine), TechHeader
│   │   ├── reporting/                 ← Chart + table components
│   │   ├── providers/                 ← SessionProvider wrapper
│   │   └── ui/                        ← table, EmptyState, ErrorState, LoadingState
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── config.ts              ← NextAuth options — bcrypt + Supabase DB lookup
│   │   │   ├── api-auth.ts            ← requireApiAuth, requirePermission, getTenantId
│   │   │   ├── tenant.ts              ← getTenantId(session) helper — throws if missing
│   │   │   └── index.ts               ← getSession, requireAuth, requireRole (server-side)
│   │   ├── db/
│   │   │   ├── client.ts              ← supabaseAdmin (service role, bypasses RLS)
│   │   │   ├── supabase.ts            ← exports supabaseAdmin + anon supabase client
│   │   │   ├── browser.ts             ← createBrowserClient for React client components
│   │   │   ├── queries/               ← All DB query functions per domain
│   │   │   └── types.ts               ← DB row types
│   │   ├── ghl/
│   │   │   ├── client.ts              ← GHL API client (retry, backoff, 204 handling)
│   │   │   ├── create-work-order-from-ghl.ts  ← 7-step orchestrator for OpportunityStatusChange
│   │   │   ├── create-work-order-from-appointment.ts  ← AppointmentBooked handler (not yet wired)
│   │   │   ├── upsert-property-from-ghl.ts    ← ContactCreate/Update handler (not yet wired)
│   │   │   ├── map-opportunity.ts     ← Pure mapping functions (status, category, priority)
│   │   │   ├── work-order-factory.ts  ← WO creation logic using confirmed stage names
│   │   │   ├── sync-completion.ts     ← Fire-and-forget: WO completed → GHL won
│   │   │   ├── sync-estimate.ts       ← Fire-and-forget: estimate flagged → GHL task
│   │   │   ├── retry-queue.ts         ← In-memory retry queue (needs DB persistence)
│   │   │   ├── tenant-config.ts       ← resolveTenantId, resolveGhlUserToTechId from env
│   │   │   ├── reporting-service.ts   ← GHL reporting data fetcher
│   │   │   ├── reporting-aggregator.ts ← Data aggregation for reports
│   │   │   └── reporting-cache.ts     ← Report caching layer
│   │   ├── email/
│   │   │   ├── resend.ts              ← Resend client
│   │   │   └── invite.ts              ← Invite email templates + sending
│   │   ├── storage/
│   │   │   ├── photos.ts              ← Job photo upload to Supabase Storage
│   │   │   └── avatars.ts             ← Avatar upload to Supabase Storage
│   │   ├── scheduling/
│   │   │   └── generate-visits.ts     ← Cron logic for recurring visit generation
│   │   ├── constants/
│   │   │   └── ghl-pipeline.ts        ← CONFIRMED Showtime pipeline stage names
│   │   ├── validation/                ← Zod schemas per domain
│   │   └── utils/index.ts             ← cn() helper
│   ├── types/
│   │   ├── work-order.ts              ← WorkOrderStatus, ServiceCategory, EstimateHandoffStatus, transitions
│   │   ├── visit.ts                   ← VisitStatus, ChecklistItem, Visit
│   │   ├── property.ts                ← Property, pool equipment types
│   │   ├── technician.ts              ← Technician, UserRole enum
│   │   ├── team.ts                    ← TeamMember
│   │   ├── tenant.ts                  ← Tenant, TenantCompanyProfile
│   │   ├── ghl.ts                     ← GHLWebhookPayload discriminated union (11 types)
│   │   ├── reporting.ts               ← Report types
│   │   ├── estimate.ts                ← Estimate types
│   │   ├── recurring-schedule.ts      ← RecurringSchedule type
│   │   └── next-auth.d.ts             ← Session type augmentation (id, role, tenant_id, technician_id)
│   └── config/
│       ├── roles.ts                   ← rolePermissions map (RolePermissions flags per UserRole)
│       ├── navigation.ts              ← Sidebar nav items config
│       ├── checklist-templates.ts     ← Pool service checklist templates per ServiceCategory
│       └── service-types.ts           ← ServiceCategory display names
└── memory/                            ← Detailed decision logs
    ├── product-decisions.md
    ├── technical-decisions.md
    ├── confirmed-facts.md
    ├── ghl-rules.md
    ├── open-questions.md
    ├── client-showtime-pools.md
    ├── assumptions.md
    └── glossary.md
```

---

## Build Order Remaining

1. **Wire ContactCreate/ContactUpdate webhooks** — `upsert-property-from-ghl.ts` exists; add cases to webhook dispatch switch in `src/app/api/ghl/webhooks/route.ts`

2. **Wire AppointmentBooked webhook** — `create-work-order-from-appointment.ts` exists; add case to dispatch switch

3. **Persist GHL retry queue** — Replace in-memory `retry-queue.ts` with a `work_order_sync_queue` DB table (add migration); write a cron job to drain it

4. **Surface `ghl_sync_failed` in admin UI** — Add a warning badge to `WorkOrderDetail.tsx` when `ghl_sync_failed === true`

5. **Stripe integration** — Add env vars (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`), create `/api/stripe/webhook` route, wire Stripe in settings for tenant billing

6. **Complete estimates workflow** — Estimates page (`EstimatesPageClient.tsx`) needs send/approve/decline actions fully wired to Supabase

7. **QA pass** — Test all role permission scenarios, test GHL webhook with live Showtime payloads, test on actual mobile device, tenant isolation test with two test tenants

8. **Multi-tenant onboarding** — New tenant signup flow, GHL location mapping UI, tenant billing via Stripe

---

## Critical Rules (Never Break These)

### Product Boundaries
- **Do NOT rebuild GHL CRM features** — no contacts, conversations, SMS/email, pipeline management, calendars, forms, or marketing automations
- ServiceOps starts AFTER a lead becomes job-ready (Appointment Booked or Opportunity stage change)
- Before adding any feature: ask "Does GHL already do this?" — if yes, integrate instead of build

### GHL Integration Rules
- GHL is source of truth for contacts — reference by `ghl_contact_id` only, never store full contact records
- **Never hardcode GHL API tokens or credentials** — always from `process.env`
- Always verify webhook signatures (HMAC or Bearer) before processing
- Handle GHL API errors gracefully — never block job completion on GHL being down
- `GHL_PRIVATE_INTEGRATION_TOKEN` must never be placed in a GHL workflow config or public-facing config
- Test with sandbox/sub-account before connecting to client's live GHL

### Coding Standards
- TypeScript strict mode — no `any`
- Next.js App Router only — no Pages Router
- Tailwind CSS only — no inline styles, no custom CSS unless unavoidable
- All API routes: call `getTenantId(auth.session)` immediately after auth — never use `session.user.tenant_id` directly
- Pass `tenantId` to every store/DB query function — `tenant_id` on every database query
- Zod validation on all API inputs
- UUID for all primary keys
- Soft delete only (`is_active = false`) — never hard-delete properties, users, etc.
- `WORK_ORDER_STATUS_TRANSITIONS` in `src/types/work-order.ts` — use for transition validation everywhere, never hardcode elsewhere

### Auth Rules
- Auth required on ALL non-public API routes — call `requireApiAuth()` or `requirePermission()`
- TECHNICIAN role auto-scoped to own jobs only — check `isTechnicianScoped(session)` in list endpoints
- Route protection enforced in `src/middleware.ts` — TECHNICIAN → `/tech/today`; Admin/Staff → `/dashboard/overview`

### Security Rules
- Never hardcode API keys, secrets, or tokens in code
- Log security events (failed auth, invalid webhook signatures) via `console.warn`
- PII (customer names, addresses, phones) handled carefully
- `SUPABASE_SERVICE_ROLE_KEY` is server-side only — never import `src/lib/db/client.ts` in client components

### Documentation Rules
- Update `MEMORY.md` and `memory/` files after every major decision
- Write spec in `specs/` before building a new feature
- Document schema changes in `database-blueprint/` before creating migrations
- Document GHL integration changes in `integration-blueprint/` before coding

---

## How to Continue Building

1. **Read these files first** (every session):
   - `CLAUDE.md` — project rules and product boundaries
   - `MEMORY.md` — full technical history and confirmed decisions
   - `SETUP_NOTES.md` — env var status and GHL integration guide

2. **Local dev setup**:
   ```bash
   cd serviceops-ghl-workorders-scaffold/serviceops-ghl-workorders
   cp .env.example .env.local
   # Fill values from Vercel dashboard
   # Set APP_ENV=development locally
   npm install
   npm run dev
   ```

3. **DB changes**: always create a new migration file in `supabase/migrations/` with format `YYYYMMDDHHMMSS_description.sql`. Run via Supabase dashboard or Supabase CLI.

4. **API routes pattern**:
   ```ts
   const auth = await requireApiAuth();          // or requirePermission("canXxx")
   if (!auth.ok) return auth.response;
   const tenantId = getTenantId(auth.session);   // throws if tenant_id missing
   // ... use tenantId in every DB call
   ```

5. **Auth users** are in the Supabase `users` table — `password_hash` field (bcrypt). Create users via Supabase dashboard SQL or a seed script. Demo: `admin@showtime.local` / `admin2024`, `tech@showtime.local` / `tech2024`.

6. **GHL webhook testing**: use `scripts/test-ghl-webhook.sh` — signs payloads with `GHL_WEBHOOK_SECRET` via `openssl dgst -sha256 -hmac`.

7. **Print/typecheck before committing**: `npm run typecheck && npm run lint`

---

## Next Prompt to Run

Paste this to start the next session:

```
Read CLAUDE.md, MEMORY.md, SETUP_NOTES.md, and HANDOFF.md first.

The app is live at https://serviceops-ghl-workorders.vercel.app.
Client is Showtime Pool Service (California). GHL Private Integration Token is set.
All Supabase migrations have been applied. Auth uses NextAuth v4 + bcrypt + Supabase users table.

Current priorities:
1. Wire the ContactCreate and ContactUpdate GHL webhook events — the handler file 
   `src/lib/ghl/upsert-property-from-ghl.ts` already exists but is not called from 
   the dispatch switch in `src/app/api/ghl/webhooks/route.ts`.

2. Wire the AppointmentBooked webhook event — 
   `src/lib/ghl/create-work-order-from-appointment.ts` exists but not connected.

3. Replace the in-memory GHL retry queue (`src/lib/ghl/retry-queue.ts`) with a 
   DB-backed queue (new Supabase migration + cron drain route).

Before building anything, confirm my understanding of the current webhook dispatch 
switch, show me the existing handler files, and propose the implementation plan.
Do not code until I confirm the plan.
```

---

## Open Questions (Unresolved)

1. Which GHL plan does Showtime Pool Service use? (affects API rate limits)
2. Photo storage: Supabase Storage is wired — confirm client is OK with Supabase for photo hosting
3. Recurring visits: internal cron scheduler is wired — confirm if GHL calendar sync is also needed
4. Estimate handoff: current flow creates a GHL *task* — does client want a pipeline stage change instead?
5. GHL custom field IDs for `gate_code`, `access_notes`, `service_notes`, `scheduled_date`, `service_category`, `priority` — must retrieve from client's GHL account for ContactCreate webhook handler
6. GHL calendar ID → service category mapping for AppointmentBooked events (`GHL_CALENDAR_TO_SERVICE_CAT` env map)
7. Does the client want customer email/SMS notifications via GHL when a job is completed?
8. How many technician accounts need to be seeded in the Supabase `users` table?
