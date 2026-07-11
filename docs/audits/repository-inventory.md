# Repository Inventory — Phase 0

_Full catalog of the repository's code, config, and tooling surface as of branch `feat/phase-0-audit`, parent commit `9977037`. Companion documents: `docs/architecture/current-state.md` (narrative architecture), `docs/architecture/erd.md` (database detail), `docs/audits/security-audit.md` (findings)._

## Git state at audit start

- Prior branch: `master`, HEAD `9977037` ("feat: Phase 15 — invoice system + Stripe Connect deposit (§8.2/§8.3)")
- Working tree had 6 untracked files at audit start (`ServiceOps_Claude_Code_All_Phases.md`, `dev.log`, `markate_report.md`, `public/sw.js`, `public/workbox-*.js`, `supabase/.temp/`) — none committed, none touched by this phase except the three planning docs which are legitimate untracked reference material.
- Two remotes configured: `origin` (`github.com/Eriin2816/service-command-ops.git`, original dev repo) and `client` (`github.com/operations148/ShowtimeServiceCommandOps.git`, the client's repo the code was pushed to). This phase works on a new branch off the state already pushed to `client`.
- This audit's branch: `feat/phase-0-audit`.

## Module completion status (verified against actual code, not documentation)

_Full independent verification pass — for each module, real page/component/route source was read and data flow traced UI→API→DB. Several results correct stale claims in `MEMORY.md`/`HANDOFF.md` in both directions (some "done" items are stubs; one "not started" item is actually done)._

| # | Module | Status | Key evidence | Gap |
|---|---|---|---|---|
| 1 | Dashboard shell + nav | Partial | Role-filtered nav renders correctly | "Invoices" nav link (`src/config/navigation.ts` → `/dashboard/invoices`) 404s — no such route exists |
| 2 | Work orders | **Complete** | List/detail/status-machine/PDF/send-estimate all real and wired | None — most mature module in the app |
| 3 | Properties | **Complete** | Inline edit for equipment/access/service notes, real PATCH-backed | None |
| 4 | Equipment records | Stub — not a distinct feature | `PoolEquipment` is only a JSONB blob on `properties.pool_equipment` | No separate entity, no history/audit trail |
| 5 | Visits (admin) | **Missing** | `src/app/dashboard/visits/page.tsx` is a static `EmptyState`, no data fetch; `src/components/visits/` directory exists but is empty | Entire admin visit history view is unbuilt |
| 6 | Technician mobile view | **Complete** | Real fetch, checklist-from-template, full completion state machine | `src/app/tech/complete/[id]` directory exists but is empty/dead (completion is handled inline instead) |
| 7 | Checklists | Complete as JSONB, but the normalized `checklist_items` table is dead | Templates + JSONB completion tracking fully wired | `checklist_items` table has zero code references anywhere — designed as the reporting source-of-truth per its own migration comment, never used |
| 8 | Photos | **Complete** | Real Storage upload/signed URL/delete, lightbox gallery | None |
| 9 | Technician notes | Complete as plain text, but the normalized `technician_notes` table is dead | Single plain-text field fully wired | `technician_notes` table has zero code references — no per-note timestamps/multi-tech attribution as the migration envisioned |
| 10 | Recurring schedules | **Complete** | Full CRUD per-property, idempotent generation, protected cron | Settings page lists it as "Coming Soon · Phase 2" — stale, since the feature already exists (just per-property, not as a standalone admin page) |
| 11 | Team management | **Complete** | Full CRUD, invite side-effect, self-delete guard | None |
| 12 | Technicians management | **Complete** | Full CRUD, bcrypt hash, dedupe check | None |
| 13 | Invitations | Partial — functional but insecure | Full accept flow works end-to-end | Token stored/compared in plaintext (no hashing); `user_invitations` has no migration file at all |
| 14 | Estimates | **Complete** for what it is (a status-tracking queue) | Real PATCH-backed status transitions | Not a document/pricing builder — matches the app's actual scope, but worth being explicit that it isn't a quoting tool |
| 15 | Invoices | **Missing / fully orphaned** | Backend (`createInvoiceFromEstimate`, full query layer) is real and well-built | Zero callers anywhere in the app; no API route, no admin page; nav link 404s |
| 16 | Stripe | **Missing / fully orphaned** | Webhook receiver is real | `createDepositCheckoutSession` has zero callers; all 4 Stripe env vars are empty; nothing can trigger a checkout even in theory |
| 17 | Reports | Partial — one labeling bug | Owner/Marketing/Tech-Performance all render real live data | "Tech Performance" tab UI routes to `/reports/va` and shows tech data there; the real, separate `/api/reports/va-performance` is fully built but never called by any page |
| 18 | Settings | Partial (honestly self-documented) | Company profile + GHL status display fully wired | Notification prefs, checklist-template editor, billing/plan explicitly marked "Coming Soon" in-app — accurate, not overclaiming |
| 19 | GHL webhooks inbound | **Complete — corrects stale docs** | `ContactCreate`/`ContactUpdate` → real `upsertPropertyFromGHL()`; `AppointmentBooked` → real `createWorkOrderFromAppointment()`, both idempotent | `MEMORY.md` Phase 16/17 status ("Not Started") is stale — these are implemented and functional |
| 20 | GHL outbound sync | Complete (logic), Partial (durability) | Completion + estimate-task sync both real, with `ghl_sync_failed` UI retry | Retry queue confirmed in-memory only — lost on restart |
| 21 | PWA | **Complete** (installable), Partial (offline) | Manifest, service worker, install prompt all real | `runtimeCaching: []` — no offline API-call strategy, only build-precache |
| 22 | Customer portal | **Missing entirely** | No route exists outside `/dashboard`/`/tech`/`/login`/`/accept-invite` | Stripe code already builds a redirect URL to a page (`/estimate/[token]`) that doesn't exist |

## API routes (35 route.ts files under src/app/api/**)

| Path | Methods | Auth | Tenant-scoped | Zod validation | Delete type |
|---|---|---|---|---|---|
| `api/auth/[...nextauth]` | GET/POST | NextAuth provider itself | n/a | n/a | n/a |
| `api/cron/generate-visits` | GET | `CRON_SECRET` header (**fails open if unset** — see security-audit H3) | Loops all tenants (by design) | none (no body) | n/a |
| `api/ghl/test-connection` | GET | **none** | n/a | n/a | n/a |
| `api/ghl/webhooks/health` | GET | none | n/a | n/a | n/a |
| `api/ghl/webhooks` | POST | Bearer / `?token=` / HMAC (custom) | Yes, via `resolveTenantId` | none (raw JSON) | n/a |
| `api/invitations/accept` | POST | none (public, token+password) | Implicit via invite's tenant | `AcceptSchema` | n/a |
| `api/notifications` | GET | `requireApiAuth` | Yes | n/a | n/a |
| `api/profile/avatar` | POST/DELETE | `requireApiAuth` | No (scoped to own user id only) | manual mime/size | storage delete |
| `api/properties` | GET/POST | `requirePermission` | Yes | `CreatePropertySchema` | n/a |
| `api/properties/[id]` | GET/PATCH | `requirePermission` | Yes | `PatchPropertySchema` | soft (`is_active`) — no DELETE route exists |
| `api/recurring-schedules` | GET/POST | `requireApiAuth`/`requirePermission` | Yes | `CreateRecurringScheduleSchema` | n/a |
| `api/recurring-schedules/[id]` | PATCH/DELETE | `requirePermission` | Yes | `UpdateRecurringScheduleSchema` | **hard delete** |
| `api/reports/marketing-performance` | GET | `requirePermission` | Yes | none (query params) | n/a |
| `api/reports/owner-performance` | GET | `requirePermission` | Yes | none | n/a |
| `api/reports/range` | GET | `requirePermission` | Yes | manual regex | n/a |
| `api/reports/refresh` | POST | `requirePermission` | Yes | n/a | n/a |
| `api/reports/summary` | GET | `requirePermission` | Yes | n/a | n/a |
| `api/reports/tech-performance` | GET | `requirePermission` | Yes | none | n/a |
| `api/reports/va-performance` | GET | `requirePermission` | Yes | none | n/a |
| `api/settings/company/logo` | POST/DELETE | `requirePermission` | Yes | manual mime/size | storage delete + soft null |
| `api/settings/company` | GET/PATCH | `requireApiAuth`/`requirePermission` | Yes | `UpdateCompanySchema` | n/a |
| `api/stripe/webhook` | POST | Stripe signature | Yes, via `getTenantByStripeAccountId` | Stripe SDK typing only | n/a |
| `api/team` | GET/POST | `requireApiAuth`/`requirePermission` | Yes | `CreateTeamMemberSchema` | n/a |
| `api/team/[id]` | PATCH/DELETE | `requirePermission` | Yes | `PatchTeamMemberSchema` | **hard delete** (gated: no self-delete, must deactivate first) |
| `api/team/[id]/resend-invite` | POST | `requirePermission` | Yes | n/a | n/a |
| `api/technicians` | GET/POST | `requireApiAuth`/`requirePermission` | Yes | `CreateTechnicianSchema` | n/a |
| `api/technicians/[id]` | GET/PATCH | `requireApiAuth`/`requirePermission` | Yes | `PatchTechnicianSchema` | soft only — no DELETE route |
| `api/visits` | GET/POST | `requireApiAuth` (**POST has no permission gate**) | Yes | `CreateVisitSchema` (no ownership check — see security-audit M8) | n/a |
| `api/visits/[id]` | GET/PATCH | `requireApiAuth` | Yes, + technician ownership | `PatchVisitSchema` | n/a |
| `api/visits/[id]/photos` | GET/POST/DELETE | `requireApiAuth` | Yes, + technician ownership | manual mime/size (POST); DELETE has IDOR gap — security-audit M7 | storage delete |
| `api/work-orders` | GET/POST | `requireApiAuth`/`requirePermission` | Yes, technician-scoped on GET | `NewWorkOrderSchema` | n/a |
| `api/work-orders/[id]` | GET/PATCH/DELETE | mixed (`requireApiAuth`/`requirePermission`) | Yes | `PatchWorkOrderSchema` | **hard delete**, large cascade blast radius |
| `api/work-orders/[id]/history` | GET | `requireApiAuth` | Yes | n/a | n/a |
| `api/work-orders/[id]/report` | GET | `requireApiAuth` | Mostly (one nested `properties` lookup untenant-scoped) | n/a | n/a |
| `api/work-orders/[id]/send-estimate` | POST | **`requireApiAuth` only — no permission/ownership gate** (security-audit H4) | Partially | `BodySchema` | n/a |

No public customer-facing route (`/estimate/[token]` or similar) exists anywhere under `src/app`.

## Database migrations (20 files, `supabase/migrations/`, applied in filename order)

| Migration | Content |
|---|---|
| 20260506000001_create_enums | 7 enum types (user_role, work_order_status, priority, service_category, estimate_handoff_status, visit_status — later joined by invoice_status in 20260613000001) |
| 20260506000002_create_tenants | `tenants` table + seed row |
| 20260506000003_create_users | `users` table (`UNIQUE(tenant_id, email)`) + 2 seed users |
| 20260506000004_create_properties | `properties` table |
| 20260506000005_create_work_orders | `work_orders` table, `wo_number` true DB identity sequence |
| 20260506000006_create_visits | `visits` table |
| 20260506000007_create_checklist_items | `checklist_items` table |
| 20260506000008_create_technician_notes | `technician_notes` table |
| 20260506000009_create_photos | `photos` table (immutable) |
| 20260506000010_create_estimate_handoffs | `estimate_handoffs` table (the live estimate-flag state machine) |
| 20260506000011_enable_rls | RLS enabled + policies on all 8 tables above, helper functions `current_tenant_id()`/`current_user_id()`/`current_user_role()` |
| 20260506000012_add_password_hash | `users.password_hash` |
| 20260506000013_make_property_id_nullable | `work_orders.property_id` → nullable |
| 20260513000001_add_tenant_company_profile | `tenants` company-profile columns |
| 20260514000001_add_recurring_schedules | `recurring_schedules` table + `work_orders.recurring_schedule_id` |
| 20260514000002_create_work_order_status_history | `work_order_status_history` audit table + `work_orders.estimate_notes` |
| 20260515000001_create_user_activity_log | `user_activity_log` audit table (RLS, no metadata column) |
| 20260515000003_add_ghl_trigger_stage | `work_orders.ghl_trigger_stage` |
| 20260613000001_invoices | `invoice_status` enum; ALTER-only additions to the **undocumented, dashboard-created** `invoices` table; `estimate_handoffs` acceptance-token columns (unused); `tenants` Stripe Connect columns |
| 20260617000001_grant_invoices_service_role | GRANT fix for the `invoices` table's missing auto-grants |

**Two live tables have no migration at all**: `invoices` (base table) and `user_invitations`. A third, `invoice_line_items`, is referenced in application code with no migration and unverified existence/grants. See `docs/architecture/erd.md` for full detail and consequences.

## Claude Code agents (`.claude/agents/`, 17 files)

| Agent | Scope |
|---|---|
| `product-orchestrator` | Scope decisions, MVP priority, prevents overbuilding / rebuilding GHL |
| `solutions-architect` | Architecture, module design, data flow, API design |
| `ghl-integration-architect` | All GHL API/webhook/contact/opportunity/calendar questions |
| `field-operations-designer` | Work orders, visits, technician workflow, checklists, completion reports |
| `ux-dashboard-designer` | Admin dashboard + technician mobile UI, navigation, tables, filters |
| `data-modeling-agent` | Schema design, entity relationships, enums, validation, source-of-truth |
| `qa-review-agent` | Requirements review, permission issues, edge cases, launch readiness |
| `security-permissions-agent` | Tenant isolation, role permissions, PII handling, API-key safety, audit logs |
| `documentation-agent` | Keeping docs updated after major decisions/feature completion |
| `work-order-module-agent` | Work order lifecycle, statuses, assignment, completion logic |
| `property-profile-agent` | Property records, pool equipment, access notes, service history |
| `technician-mobile-agent` | Technician daily job list, checklist completion, photo uploads, notes |
| `recurring-visits-agent` | Recurring schedules, visit generation, skip/reschedule |
| `estimate-handoff-agent` | Estimate-needed flag, GHL task creation, opportunity handoff |
| `reporting-kpi-agent` | Owner KPIs, ops reports, overdue jobs, technician productivity |
| `checklist-template-agent` | Pool-service checklist templates per service category |
| `ai-knowledge-agent` | Future AI knowledge base (Phase 9+ planning only — not yet built) |

All 17 agents are scoped to `Read, Write, Edit, Glob, Grep` tools and `claude-sonnet-4-5`. None currently reference the Markate expansion phases — they were authored for the original 20-phase build order in `ROADMAP.md`/`CLAUDE.md` and will need scope updates (or new agents) as the Markate-inspired phases introduce genuinely new domains (pricebook, dispatch/calendar, change orders, customer portal, time/costing, platform admin) that don't map cleanly onto any existing agent.

## Claude Code skills (`.claude/skills/`, 7 skills)

`dashboard-ui`, `data-modeling`, `documentation`, `ghl-integration`, `project-planning`, `qa-review`, `work-order-design` — matching `CLAUDE.md` §15 exactly, one-to-one.

## Config / constants (`src/config/`)

- `roles.ts` — `rolePermissions` map, 9 boolean flags × 5 roles (see security-audit / permission matrix below)
- `navigation.ts` — sidebar nav item definitions
- `checklist-templates.ts` (107 lines) — per-service-category checklist templates + `FALLBACK_ITEMS`
- `service-types.ts` — 10 `ServiceCategory` display configs with estimated durations, 4 `Priority` display configs
- `ghl-pipeline.ts` (`src/lib/constants/`) — the 10 confirmed Showtime pipeline stage names and their action mapping

## Role × permission matrix (current, from `src/config/roles.ts`)

| Permission | Platform Owner | Tenant Admin | Office Staff | Technician | Read-Only Owner |
|---|---|---|---|---|---|
| canViewAllWorkOrders | ✅ | ✅ | ✅ | ❌ | ✅ |
| canCreateWorkOrders | ✅ | ✅ | ✅ | ❌ | ❌ |
| canAssignTechnicians | ✅ | ✅ | ✅ | ❌ | ❌ |
| canViewAllProperties | ✅ | ✅ | ✅ | ❌ | ✅ |
| canEditProperties | ✅ | ✅ | ✅ | ❌ | ❌ |
| canViewReports | ✅ | ✅ | ✅ | ❌ | ✅ |
| canManageSettings | ✅ | ✅ | ❌ | ❌ | ❌ |
| canManageTenants | ✅ | ❌ | ❌ | ❌ | ❌ |
| canViewOwnJobsOnly | ❌ | ❌ | ❌ | ✅ | ❌ |

This is a **flat, single-tenant-shaped** permission model — 9 boolean flags, no per-resource-action granularity (e.g. no distinction between "read work orders" and "override a locked estimate"; no separate financial-vs-operational report permission; no audit-log-read permission; no payment-refund permission). Phase 1's "granular permissions" requirement (work-order read/create/update/assign/archive, invoice read/manage, payment refund, time approve, reports operational vs financial, audit-log read, tenant manage, etc.) is **not yet met** by this model — this is expected, since that expansion is explicitly Phase 1's job, not something already done.

## Route × role access (middleware-level, `src/middleware.ts`)

| Route prefix | Unauthenticated | Technician | Office Staff / Tenant Admin / Platform Owner / Read-Only Owner |
|---|---|---|---|
| `/login` | Allowed | Redirected to `/tech/today` | Redirected to `/dashboard/overview` |
| `/dashboard/*` | Redirected to `/login` | Redirected to `/tech/today` | Allowed (further gated per-route by `requirePermission`) |
| `/tech/*` | Redirected to `/login` | Allowed | Allowed (not blocked — no explicit non-technician redirect away from `/tech/*`, though the UI doesn't link there for other roles) |
| `/api/*` | **Not covered by middleware at all** | Per-route auth only | Per-route auth only |
| everything else (public marketing pages, etc.) | N/A — no public marketing pages exist in this app | | |

## Dependencies (see `docs/audits/dependency-audit.md` for the full vulnerability/outdated breakdown)

24 direct dependencies (14 runtime, 10 dev), 845 total resolved packages. Key stack: Next.js 15.5.15, React 18.3.1, TypeScript 5.9.3, Supabase JS 2.105.3, NextAuth 4.24.14, Zod 4.4.2, Stripe 22.2.0, pdfkit 0.18.0, next-pwa 5.6.0, Resend 6.12.3.

## Test tooling

**None.** No test framework, no test files, no CI workflow. See `qa/test-baseline.md`.
