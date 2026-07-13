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
| 21 | Markate-Inspired Expansion — Phase 0 (Repository Audit) | ✅ Done 2026-07-11 — see `docs/audits/`, `docs/architecture/`, `docs/implementation/`, `memory/phase-0-audit.md`. 0 critical / 4 high security findings; master plan for Phases 1-11 established. Phase 1 (security foundation) is next and is a release blocker. |

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
