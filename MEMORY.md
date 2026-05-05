# MEMORY.md — ServiceOps Command Center

_Last updated: estimate-flagged → GHL task sync wired to visits PATCH (2026-05-05)._

## Product Identity
- **Name**: ServiceOps Command Center
- **Type**: GHL-integrated work order and field operations SaaS
- **First client**: Showtime Pool Service, California
- **Future vision**: White-label Jobber-style add-on for GHL users
- **GitHub repo**: https://github.com/Eriin2816/service-command-ops.git (initial commit pushed 2026-05-05)

## Build Phase Status
| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Scaffold | ✅ Done |
| 1 | MVP UI Shell + Navigation | ✅ Done |
| 1b | Technician Mobile Shell (/tech/today) | ✅ Done |
| 2 | Work Order Module | ✅ Done (list + detail + New WO modal, mock data + API) |
| 3 | Property Profile Module | ✅ Done (types + list + detail + API + Add Property form) |
| 4 | Technician Mobile View (full) | ✅ Done (today list + job detail + checklist + visits API + completion flow) |
| 5 | GHL Webhook Intake | 🔄 In Progress (mapping docs ✅, HMAC verification ✅, OpportunityStatusChange processing ✅, QA script ✅) |
| 6 | Status Sync Back to GHL | 🔄 In Progress (GHL client ✅, completion sync ✅, retry queue placeholder ✅, estimate task sync ✅) |
| 7 | Reporting Dashboard | ⏳ Pending |
| 8 | QA and Launch | ⏳ Pending |

## Confirmed Decisions (Phase 4 — Tech Mobile)
- **Tech today page uses real types**: `WorkOrderWithRelations` from `@/types/work-order` — no local placeholder types. 3 jobs (wo-001, wo-002, wo-003) sorted by `scheduled_time_start`.
- **Server/client split on job detail**: `page.tsx` is a server component that fetches WO, property, checklist template, and creates the visit via `getOrCreateVisit`. `JobDetail.tsx` is `'use client'` and owns all interactive state.
- **Visit created server-side on page load**: `getOrCreateVisit(workOrderId, ...)` is idempotent per `work_order_id`. The visit ID is passed to the client as a prop.
- **globalThis anchor on visit store**: `visit-store.ts` stores its array on `globalThis.__visitStore` to survive Next.js module re-instantiations in dev mode. Without this, the API route sees a different `store` array than the server component.
- **JobDetail state machine**: 6 phases: `idle → warn_incomplete → submitting → done_complete` OR `idle → estimate_prompt → submitting → done_estimate`. No modals for the warning (inline in action bar). Bottom sheet for estimate prompt.
- **Checklist template fallback**: `checklistTemplates` only covers 6 of 10 `ServiceCategory` values. `FALLBACK_ITEMS` (6 generic items) is used for `equipment_installation`, `new_construction`, `pool_inspection_diagnostic`, `other`.
- **Completion confirmation is full-page replacement** (not a banner on top of the job detail). Summary shows checked/total items and whether notes were added. Timer-stamped. "Back to Today's Jobs" is the only action.

## Confirmed Decisions (Phase 3 — Properties)
- **Equipment storage**: `pool_equipment` stored as JSONB on `properties` table — one snapshot of current state, not history.
- **`ghl_contact_id` is optional**: properties can exist without a GHL link.
- **`gate_code` is a separate field**: split from `access_notes` for at-a-glance visibility. Plain text in Phase 3.
- **`customer_name` does not auto-sync with GHL**: manual correction acceptable for Phase 3.
- **`PropertyWithRelations`**: adds `active_work_order_count`, `last_service_date`, `last_service_technician_name` — computed at DB time, hardcoded in mock.
- **Soft delete only**: `is_active = false` — never hard-delete a property.

## Confirmed Decisions (Phase 2)
- **WO number format**: `WO-XXXX` — 4-digit zero-padded. Auto-expands past 9999.
- **Multi-visit scope**: Phase 2 = one visit per WO created silently. Visits surface in Phase 4.
- **Status transitions**: codified in `WORK_ORDER_STATUS_TRANSITIONS` in `src/types/work-order.ts`. Do not hardcode elsewhere.

## Tech Stack (Confirmed)
- **Framework**: Next.js 15, App Router — no Pages Router ever
- **Language**: TypeScript strict mode — no `any`
- **Styling**: Tailwind CSS only — no inline styles, no custom CSS unless unavoidable
- **UI components**: shadcn/ui-compatible pattern (Radix primitives approach)
- **Icons**: lucide-react
- **Class utility**: `cn()` from `clsx` + `tailwind-merge` — lives in `src/lib/utils/index.ts`
- **Fonts**: `Sora` (display/headings) + `Plus Jakarta Sans` (body) via `next/font/google`
- **Database**: Placeholder — Supabase/PostgreSQL planned, not wired yet
- **Auth**: Placeholder — no real auth in Phase 1–4, role hardcoded as TENANT_ADMIN

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

## Confirmed Decisions (Phase 3 — Add Property Form)
- **Pattern**: `NewPropertyButton.tsx` + `NewPropertyModal.tsx` — identical shape to `NewWorkOrderButton` + `NewWorkOrderModal`. Button owns modal open state + 6s success banner. Modal is a slide-over drawer.
- **Form fields**: Customer Name, Street Address, Apt/Unit, City/State/ZIP (5-col grid), Gate Code (mono font), Access Notes, Service Notes. Pool equipment deliberately excluded — too complex for creation; handled via inline edit on detail page.
- **Pool equipment note**: Shown as a footer callout inside the form: "Pool equipment can be added after creation on the property detail page."
- **State validation**: `city/state/zip` in a `grid-cols-5` layout — city 2 cols, state 1 col, zip 2 cols. State input uppercases and truncates to 2 chars inline (`toUpperCase().slice(0, 2)`).
- **Success callback**: `onSuccess(id: string, name: string)` — banner shows customer name, not a WO number.
- **POST target**: `/api/properties` — existing route, no changes needed.

## Confirmed Decisions (Phase 5 — GHL Webhook)
- **Signature header**: `x-ghl-signature` (hex digest). Verified with `timingSafeEqual` — length checked first to avoid panic.
- **Dev bypass**: If `GHL_WEBHOOK_SECRET` is unset, signature check is skipped with a warning. Hard-reject in production once the var is set.
- **Dispatch pattern**: `dispatch(payload)` switch on `payload.type` inside the route handler. Processing errors caught and swallowed — GHL always gets 200 after signature passes.
- **TypeScript exhaustiveness**: Default branch in `dispatch()` casts to `never` — fires a compile-time error if a new type is added to `GHLWebhookPayload` without a handler.
- **`createWorkOrderFromGHL` result type**: `{ outcome: "created" | "already_exists" | "skipped" | "error", workOrder? }` discriminated union. Caller pattern-matches to log; never throws.
- **Stage gate**: `isJobReadyStage(stageName, ghlStatus)` — configurable via `GHL_JOB_READY_STAGES` env (comma-separated substrings), defaults to `scheduled`, `confirmed`, `in progress`, `job ready`, `assigned`. `won` always passes. `lost`/`abandoned` always fail.
- **Service category resolution order**: custom field `GHL_CF_OPP_SERVICE_CAT` (exact enum match) → stage name keyword table → `other`.
- **Custom field key asymmetry**: Contact events → `customField: [{id, value}]`. Opportunity events → `customFields: [{id, fieldValue}]`. Separate extraction helpers: `extractContactCustomField` vs `extractOppCustomField`.
- **Idempotency**: `findByGhlOpportunityId(ghlOpportunityId, tenantId)` in store — checked before creation. On duplicate → `already_exists` outcome, existing WorkOrder returned.
- **Missing property**: If `contact.id` has no matching Property (`findPropertyByGhlContactId`), log warning + skip. Contact webhook may still be in flight — production would queue retry.
- **`createWorkOrderFull`**: New store function accepting full `CreateWorkOrderInput` + denormalized `propertyAddress` + `propertyCustomerName`. Used only by GHL processing path; UI form still uses `createWorkOrder(NewWorkOrderInput)`.

## Component Architecture
### Layout Components — `src/components/layout/`
- `DashboardShell.tsx` — client, manages `mobileNavOpen`, wraps all `/dashboard/*`
- `Sidebar.tsx` — server-compatible, ocean-navy, logo + nav + Settings pinned bottom
- `SidebarNavItem.tsx` — `'use client'`, uses `usePathname()` for active state
- `TopBar.tsx` — `'use client'`, page title from pathname map, hamburger, bell + avatar
- `MobileNav.tsx` — `'use client'`, slide-in drawer with backdrop, Escape + scroll lock
- `TechShell.tsx` — mobile-only layout for `/tech/*`, no sidebar, high-contrast design
- `Breadcrumb.tsx` — server; accepts `BreadcrumbItem[]`; Home icon links to `/dashboard/overview`

### Dashboard Components — `src/components/dashboard/`
- `StatCard.tsx` — 4 accent variants, colored top border, icon badge, trend text
- `WorkOrdersTable.tsx` — `'use client'`; status + category filter; 8-column table; links to detail
- `WorkOrderDetail.tsx` — `'use client'`; local status/estimateHandoff state; status transitions; GHL links
- `NewWorkOrderModal.tsx` — slide-over drawer; Zod validation; POSTs to `/api/work-orders`; success auto-close
- `NewWorkOrderButton.tsx` — `'use client'` wrapper; owns modal state + success banner (6s auto-dismiss)
- `PropertiesTable.tsx` — `'use client'`; real-time `useMemo` search + active/inactive filter; 7-column table
- `PropertyDetail.tsx` — `'use client'`; per-section inline edit; equipment sub-forms; gate code amber badge
- `NewPropertyModal.tsx` — `'use client'`; slide-over drawer; 9 fields; POSTs to `/api/properties`; success screen auto-closes
- `NewPropertyButton.tsx` — `'use client'`; owns modal open state + 6s success banner with customer name

### Tech Mobile Components — `src/components/tech/`
- `JobDetail.tsx` — `'use client'`; full state machine (6 phases); PATCHes `/api/visits/[id]`; 3 fixed section types: Access card (amber), Checklist (interactive, progress bar), Notes + Photos placeholders; sticky action bar; bottom sheet for estimate prompt; two full-page completion screens.

### Route Structure Built
```
src/app/
  page.tsx                         → redirect to /dashboard/overview
  layout.tsx                       → root layout, fonts
  dashboard/
    layout.tsx                     → DashboardShell
    overview/page.tsx              → KPI cards + today's jobs + alerts + tech status
    work-orders/page.tsx           → ✅ work order table with filters + mock data
    work-orders/[id]/page.tsx      → ✅ detail — all fields, status, estimate flag, handoff
    properties/page.tsx            → ✅ properties table — search + active filter + 5 mock properties
    properties/[id]/page.tsx       → ✅ detail — equipment, notes, WO history, inline edit
    technicians/page.tsx           → empty state
    visits/page.tsx                → empty state
    estimates/page.tsx             → empty state
    reports/page.tsx               → empty state
    settings/page.tsx              → 5 setting categories, all "Coming Soon"
  api/
    work-orders/route.ts           → ✅ GET (status/category/tenant_id filter) + POST
    work-orders/[id]/route.ts      → ✅ GET + PATCH (transition validation) + DELETE
    properties/route.ts            → ✅ GET (is_active, tenant_id filter) + POST (Zod)
    properties/[id]/route.ts       → ✅ GET + PATCH (Zod, tenant-scoped)
    visits/route.ts                → ✅ GET (6 filters) + POST (Zod) — Phase 4
    visits/[id]/route.ts           → ✅ GET + PATCH (Zod, tenant-scoped) — Phase 4
    ghl/webhooks/route.ts          → ✅ HMAC verification + dispatch + OpportunityStatusChange processing
  tech/
    layout.tsx                     → TechShell
    today/page.tsx                 → ✅ 3 real WO job cards (wo-001, wo-002, wo-003), sorted by time
    job/[id]/page.tsx              → ✅ server: creates visit, passes visitId + WO + property + checklist
    job/[id]/ (JobDetail.tsx)      → ✅ client: full interactive state machine
    complete/page.tsx              → stub
```

## Confirmed Decisions (Phase 6 — Outbound GHL Sync)
- **`WorkOrder.ghl_sync_failed?: boolean`**: added to the type. Optional so existing mock data stays compatible. `UpdateWorkOrderInput` picks it up automatically via `Partial<Omit<WorkOrder, ...>>` — no Zod schema change needed (it's an internal flag, never accepted from API clients).
- **Fire-and-forget pattern**: `void syncCompletionToGhl(updatedWo)` in PATCH route — not awaited. HTTP response is not held open waiting for the GHL call. Production note: wrap with `waitUntil()` in serverless to prevent premature context teardown.
- **Trigger condition**: `updatedWo.status === WorkOrderStatus.COMPLETED` — checked against the stored result, not the PATCH body, so we react to what actually happened.
- **No GHL link → silent skip**: `syncCompletionToGhl` returns immediately if `ghl_opportunity_id` is null. Work orders created manually in ServiceOps are never pushed to GHL.
- **Success clears the flag**: if a prior sync had set `ghl_sync_failed=true` and a subsequent call succeeds, the flag is cleared (`updateWorkOrder(id, { ghl_sync_failed: false })`).
- **Failure sequence**: log error with status + retries → `enqueueGhlSync` → `updateWorkOrder(id, { ghl_sync_failed: true })`. All three always run in order on failure.
- **Retry queue is in-memory only** for Phase 6. Items survive within a warm server instance but are lost on restart. A persistent queue (DB table / Redis) is needed before production. Two `console.warn` lines fire on every enqueue to make accumulation visible in dev.
- **`GHLResult<T>`**: `{ ok: true; data: T } | { ok: false; status: number | null; error: string; retriesUsed: number }`. `status: null` means network error (no HTTP response received).

## Confirmed Decisions (Phase 6 — Estimate Sync)
- **Trigger point**: `estimate_flagged` false→true transition detected in PATCH `/api/visits/[id]` by comparing pre-update visit against updated visit. No action on repeat PATCHes where flag is already true.
- **Work order state updated synchronously**: `updateWorkOrder(id, { status: ESTIMATE_NEEDED, estimate_handoff_status: FLAGGED })` is called in-request before the GHL fire-and-forget, so the WO reflects the estimate state even if GHL is unreachable.
- **GHL task title format**: `"Estimate Needed — <property_address>"` — property address comes from `workOrder.property_address` (denormalized on the WO record).
- **Task body**: `visit.technician_notes` if present, otherwise omitted.
- **Assignee**: `process.env.GHL_DEFAULT_OFFICE_USER_ID` — may be `undefined`; GHL API handles unassigned tasks gracefully.
- **Due date**: +24h from task creation time — hardcoded offset constant `DUE_DATE_OFFSET_MS`.
- **No retry queue for estimate tasks**: unlike completion sync, estimate task failures are not enqueued. `estimate_handoff_status` stays `FLAGGED` — visible in dashboard — which naturally prompts office staff to retry manually or the next sync will re-attempt on a future trigger.
- **`GHL_DEFAULT_OFFICE_USER_ID` env var**: new env var expected by `sync-estimate.ts`. Should be documented in `.env.example`.

## GHL Client (`src/lib/ghl/client.ts`)
- **Auth**: `Authorization: Bearer <token>` + `Version: 2021-07-28` (required by GHL API v2) on every request.
- **`GHL_PRIVATE_INTEGRATION_TOKEN` missing**: immediate `{ ok: false }` result, no fetch attempted, `retriesUsed: 0`.
- **Retry**: max 3 attempts. Retries on `{429, 500, 502, 503, 504}`. Does NOT retry 4xx client errors (except 429). Exponential backoff: base × 2^(attempt-1), capped at 10 s, +10% random jitter. Respects `Retry-After` header on 429.
- **204 No Content**: treated as success with `data: null` — calling `res.json()` on an empty body would throw.
- **Error extraction**: tries `json.message` → `json.msg` → `json.error` → raw text, in order. GHL uses different field names across endpoints.
- **`updateOpportunity(id, data)`**: `PUT /opportunities/{id}`. Used by completion sync with `{ status: "won" }`.
- **`createTask(id, taskData)`**: `POST /opportunities/{id}/tasks`. Used by estimate-flagged flow (not yet wired).
- **`ghlFetch<T>(method, path, body?)`**: exported for future endpoints without needing new module exports.

## GHL Processing Layer (`src/lib/ghl/`)
- **`tenant-config.ts`**: `resolveTenantId(locationId)` reads `GHL_LOCATION_TO_TENANT` JSON env map. `resolveGhlUserToTechId(ghlUserId)` reads `GHL_USER_TO_TECHNICIAN`. Both return `undefined` on missing/malformed config — never throw.
- **`map-opportunity.ts`**: Pure mapping functions (no I/O). `mapGhlStatus(ghlStatus, stageName)` — `won` → COMPLETED, `lost`/`abandoned` → CANCELLED, `open` + stage substring → intermediate status. `mapServiceCategoryFromStageName()` — ordered keyword table (specific before general; "equipment install" before "equipment"). `extractOppCustomField(fields, envKey)` — reads `fieldValue` key (not `value`). `parseGhlDate()` / `parseGhlTime()` — regex validate, return `undefined` on bad format. `mapGhlPriority()` — defaults to `normal`. `isJobReadyStage()` — configurable via `GHL_JOB_READY_STAGES` env.
- **`create-work-order-from-ghl.ts`**: 7-step orchestrator. Steps: resolve tenant → validate required fields → stage gate → property lookup → idempotency → map fields → create. Returns `CreateWorkOrderFromGHLResult` discriminated union. All skip/error paths log and return a typed result; nothing throws.
- **`client.ts`**: GHL API client — see GHL Client section above.
- **`retry-queue.ts`**: In-memory retry queue. `enqueueGhlSync(item)`, `getQueueDepth()`, `getQueueSnapshot()`. `GHLSyncQueueItem` type with `id`, `type`, `ghl_opportunity_id`, `work_order_id`, `tenant_id`, `payload`, `enqueuedAt`, `attempts`, `lastError`.
- **`sync-completion.ts`**: Outbound completion sync orchestrator. Called fire-and-forget from PATCH route on COMPLETED transition. `syncCompletionToGhl(workOrder)` — checks GHL link, calls `updateOpportunity`, handles success (clears flag) and failure (logs + enqueues + sets flag).
- **`sync-estimate.ts`**: Outbound estimate sync orchestrator. Called fire-and-forget from PATCH `/api/visits/[id]` on `estimate_flagged` false→true transition. `syncEstimateToGhl(visit)` — looks up work order, skips if no `ghl_opportunity_id`, calls `createTask({ title: "Estimate Needed — [address]", body: technician_notes, assignedTo: GHL_DEFAULT_OFFICE_USER_ID, dueDate: +24h })`. On success: sets `estimate_handoff_status → SENT_TO_GHL`. On failure: logs + returns; status stays `FLAGGED` for dashboard visibility. Never throws.

## Mock Data Store Extensions
- **`store.ts`** additions: `findByGhlOpportunityId(ghlOpportunityId, tenantId)` for idempotency; `createWorkOrderFull(input: CreateWorkOrderInput, propertyAddress, propertyCustomerName)` for GHL-originated work orders with full field set.
- **`property-store.ts`** addition: `findPropertyByGhlContactId(ghlContactId, tenantId)` — used in step 4 of opportunity processing.

## GHL Types (`src/types/ghl.ts`)
- Replaced placeholder with full discriminated union of 11 concrete payload interfaces.
- `GHLContactCustomField`: `{id, value}` — used in contact events.
- `GHLOpportunityCustomField`: `{id, fieldValue}` — used in opportunity events (different key name).
- `GHLWebhookEventType` derived from `GHLWebhookPayload["type"]` — stays in sync automatically.

## QA / Scripts
- **`qa/ghl-webhook-test-cases.md`**: 5 test cases with exact payloads, expected HTTP codes, expected log lines, expected side effects. Uses seeded `ghl-cnt-rodriguez-001` (`prop-001`) for valid cases.
- **`scripts/test-ghl-webhook.sh`**: Bash script using `openssl dgst -sha256 -hmac` for signing (`printf` not `echo` to avoid trailing-newline HMAC mismatch). TC-GHL-002 skipped with message if `GHL_WEBHOOK_SECRET` unset. PASSES/FAILURES counters; exits non-zero on failure (CI-compatible). Server reachability check before tests run.
- **TC-GHL-002 wrong signature**: 64 zero hex chars — same byte-length as real SHA256, so `timingSafeEqual` actually executes rather than being short-circuited by the length guard.

## Tech Mobile Patterns (Phase 4)
- **Today page card anatomy**: time column (12h format from `HH:MM`) → timeline dot → job info (customer · service category, address split street/city-state, WO number). Entire card is a `<Link>` to `/tech/job/[id]`. Priority bar on left edge (amber=high, red=urgent). `in_progress` card gets `ring-2 ring-brand-400`.
- **`formatTime(hhmm)` helper**: splits `HH:MM` string → `{ time: string, ampm: string }` — returns null if undefined. Used in today page and for display only.
- **`splitAddress(full)` helper**: splits on first comma → `{ street, cityState }`.
- **JobDetail state machine phases**:
  - `idle` — default; all inputs enabled; action bar shows "Mark Complete" + "Estimate Needed"
  - `warn_incomplete` — "Mark Complete" tapped with unchecked items; action bar shows warning card + "Go Back" / "Complete Anyway"
  - `estimate_prompt` — "Estimate Needed" tapped; bottom sheet overlay with textarea (amber focus ring) + "Cancel" / "Flag Estimate"
  - `submitting` — API call in flight; spinner in action bar; all inputs disabled
  - `done_complete` — full-page green confirmation with circle icon, checklist summary, timestamp, "Back to Today's Jobs"
  - `done_estimate` — full-page amber confirmation; same structure
- **`patchVisit(payload)` in JobDetail**: `fetch("/api/visits/${visitId}", { method: "PATCH", ... })`. On failure: sets `apiError` banner (dismissible X), phase reverts to `idle`.
- **Checklist toggles**: `setChecklist(prev => prev.map(...))` — circular toggle. Locked (pointer-events off) when phase is `submitting`, `done_complete`, or `done_estimate`.
- **Estimate notes**: stored separately in `estimateNotes` state, combined with `notes` on submit: `[notes, estimateNotes].filter(Boolean).join("\n\n---\n\nEstimate notes:\n")`.

## Visits API Layer (`src/app/api/visits/`)
- **GET `/api/visits`**: query params: `tenant_id` (defaults to "tenant-showtime"), `work_order_id`, `property_id`, `technician_id`, `status` (validated against `VisitStatus` enum), `estimate_flagged` ("true"/"false"). Returns `{ data: Visit[], total: number }`.
- **POST `/api/visits`**: Zod `CreateVisitSchema` — required: `work_order_id`, `property_id`, `scheduled_date` (YYYY-MM-DD). Defaults: `status = scheduled`, `checklist = []`, `photo_urls = []`, `estimate_flagged = false`. Returns 201.
- **GET `/api/visits/[id]`**: resolves `tenant_id` from `?tenant_id=` param (defaults to "tenant-showtime"). Returns 404 if wrong tenant.
- **PATCH `/api/visits/[id]`**: same tenant resolution. `PatchVisitSchema` — all optional: `status`, `checklist` (array of ChecklistItem), `technician_notes`, `estimate_flagged`, `completed_at`. Immutable fields (id, tenant_id, work_order_id, property_id) never overwritten. On `estimate_flagged` false→true: synchronously sets work order `status → ESTIMATE_NEEDED` + `estimate_handoff_status → FLAGGED`, then fire-and-forgets `syncEstimateToGhl(visit)`. Returns 200.
- **`resolveTenantId(request)`** helper in `[id]/route.ts`: reads `?tenant_id=` or defaults — same pattern across all [id] routes.

## Visit Store (`src/lib/mock-data/visit-store.ts`)
- **globalThis anchor**: `g.__visitStore` and `g.__visitIdSeq` anchored to `globalThis` to survive module re-instantiations in Next.js dev mode. Critical — without this, PATCH from client hits a different store than the one populated by the server component.
- `getOrCreateVisit(workOrderId, propertyId, technicianId, initialChecklist, tenantId)` — idempotent per `(work_order_id, tenant_id)`. Called server-side in `page.tsx`.
- `createVisit(input, tenantId)` — called from POST API route.
- `listVisits(filters)` — filters: `tenant_id` (required, defaults to "tenant-showtime"), `work_order_id`, `property_id`, `technician_id`, `status`, `estimate_flagged`.
- `getVisitById(id, tenantId)` — tenant-scoped lookup.
- `updateVisit(id, patch, tenantId)` — tenant-scoped update. Returns `VisitUpdateResult` discriminated union.

## Validation Schemas (`src/lib/validation/`)
- **`work-order.ts`**: `NewWorkOrderSchema` + `PatchWorkOrderSchema`
- **`property.ts`**: `CreatePropertySchema` + `PatchPropertySchema` — shared equipment sub-schemas (`EquipmentItemSchema` extended per type). `optStr(maxLen)` and `optDate` helpers coerce empty strings to `undefined`.
- **`visit.ts`**: `CreateVisitSchema` (required: work_order_id, property_id, scheduled_date; defaults for status/checklist/photo_urls/estimate_flagged) + `PatchVisitSchema` (all optional; `photo_urls` validates each entry as URL). Shared `ChecklistItemSchema` used in both.

## Mock Data Files (`src/lib/mock-data/`)
- **`work-orders.ts`** — `MOCK_WORK_ORDERS` — 5 WOs (WO-0001–0005). Read-only seed.
- **`store.ts`** — mutable in-memory WO store. `structuredClone` seeded. `listWorkOrders`, `createWorkOrder`, `createWorkOrderFull` (GHL path), `updateWorkOrder`, `deleteWorkOrder`, `getWorkOrderById`, `findByGhlOpportunityId`.
- **`properties.ts`** — `MOCK_PROPERTIES` — 5 properties (prop-001–005). Rich equipment data on all 5. `ghl_contact_id` set on prop-001 (`ghl-cnt-rodriguez-001`), prop-002 (`ghl-cnt-park-001`), prop-005 (`ghl-cnt-thompson-001`). prop-003 and prop-004 have no GHL link.
- **`property-store.ts`** — mutable in-memory property store. `structuredClone` seeded. `listProperties`, `getPropertyById`, `findPropertyByGhlContactId`, `createProperty`, `updateProperty`. Preserves computed relation fields on update.
- **`visit-store.ts`** — mutable in-memory visit store. **globalThis anchored** (not structuredClone). Starts empty; visits created on-demand by `getOrCreateVisit`. `listVisits`, `createVisit`, `getOrCreateVisit`, `getVisitById`, `updateVisit`. All operations are tenant-scoped.

## GHL Integration Blueprint (Phase 5 — Docs + Code In Progress)

### What's documented
- `integration-blueprint/inbound-webhooks-from-ghl.md` — endpoint, HMAC verification, event table, error handling
- `integration-blueprint/ghl-contact-mapping.md` — **fully documented** (2026-05-05)
- `integration-blueprint/ghl-opportunity-mapping.md` — **fully documented** (2026-05-05)
- `integration-blueprint/ghl-source-of-truth-rules.md` — 8 source-of-truth rules

### Contact → Property mapping highlights
- Trigger events: `ContactCreate`, `ContactUpdate`, `ContactDelete`
- GHL `id` → `ghl_contact_id`; `locationId` → `tenant_id` via `GHL_LOCATION_TO_TENANT` env map
- `name` → `customer_name`; `address1` → `address_line1`; `postalCode` → `zip`; `state` may need full-name → abbreviation conversion
- Pool-specific fields (gate_code, access_notes, service_notes) come from GHL **custom fields** — IDs are account-specific, configured as env vars: `GHL_CF_GATE_CODE`, `GHL_CF_ACCESS_NOTES`, `GHL_CF_SERVICE_NOTES`
- GHL contact `customField` format: `[{ id: "fieldId", value: "..." }]` (note: `value`, not `fieldValue`)
- `pool_equipment` is **never populated from GHL** — ServiceOps only
- Email, phone, tags: not stored in ServiceOps — GHL owns them
- Upsert logic: match on `(ghl_contact_id, tenant_id)`; on update, do NOT overwrite `pool_equipment` or `is_active`

### Opportunity → WorkOrder mapping highlights
- Trigger events: `OpportunityCreate`, `OpportunityStatusChange`, `OpportunityStageUpdate`, `OpportunityAssignedToUpdate`, `OpportunityDelete`, `AppointmentBooked`
- GHL `id` → `ghl_opportunity_id`; `contact.id` → look up Property by `ghl_contact_id` → get `property_id`
- GHL opportunity `customFields` format: `[{ id: "fieldId", fieldValue: "..." }]` (note: `fieldValue`, not `value`)
- **Stage gate**: not every opportunity creates a WorkOrder — only "job-ready" stages (Scheduled, In Progress, Confirmed, etc.). Lead/quote stages are discarded.
- **Status mapping**: requires BOTH `status` (open/won/lost/abandoned) AND `pipelineStage.name`. `won` → `completed`; `lost`/`abandoned` → `cancelled`; `open` + stage name → `new`/`assigned`/`in_progress`/etc.
- **Service category**: derived from `pipelineStage.name` via case-insensitive substring matching, OR from custom field `GHL_CF_OPP_SERVICE_CAT` (takes precedence)
- **Scheduled time**: comes from custom fields `GHL_CF_OPP_SCHEDULED_DATE` (YYYY-MM-DD), `GHL_CF_OPP_TIME_START`, `GHL_CF_OPP_TIME_END` (HH:MM 24h)
- **Priority**: from custom field `GHL_CF_OPP_PRIORITY` — defaults to `normal`
- **GHL user → tech lookup**: `GHL_USER_TO_TECHNICIAN` env map (JSON object of GHL user IDs → ServiceOps technician IDs)
- **AppointmentBooked**: slightly different payload shape — times are ISO 8601 UTC under `appointmentInfo.startTime`/`endTime`; calendar → service category via `GHL_CALENDAR_TO_SERVICE_CAT` map
- **Outbound sync** (ServiceOps → GHL): job completed → `PUT /opportunities/{id}` set `status: won`; estimate flagged → `POST /opportunities/{id}/tasks`
- **ALL stage/category name mappings must be confirmed with client** before implementation — names in docs are illustrative

## Key Coding Patterns (Repeat These)
- `cn()` from `@/lib/utils` for all conditional classNames
- `usePathname()` for active nav detection — always in `'use client'` components
- Dashboard pages: `export const metadata: Metadata = { title: "Page Name" }` for tab titles
- **Detail page params**: Next.js 15 — `params` is `Promise<{ id: string }>`, must `await params`. Both `generateMetadata` and page function await it independently.
- **Tenant resolution in API routes**: `request.nextUrl.searchParams.get("tenant_id") ?? "tenant-showtime"` — all [id] routes use a `resolveTenantId(request)` helper.
- **Response shape convention**: `{ data: T }` success; `{ error, issues? }` validation failure; `{ error }` 404/400. Consistent across all API routes.
- **globalThis pattern for shared in-memory state**: use `(globalThis as any).__storeName` to share mutable state across Next.js dev mode module instances. Required for stores that start empty and are populated server-side then read by API routes.
- **Zod schema location**: `src/lib/validation/` — one file per domain. Schemas named `Create*Schema` + `Patch*Schema`. Types inferred with `z.infer<>`.
- **Filter controls pattern** (Phase 2+): `'use client'` wrapper component holds filter state; receives full data array as prop from server page.
- **shadcn/ui Table**: `Table, TableHeader, TableBody, TableRow, TableHead, TableCell` from `@/components/ui/table`.
- **Status/priority badges**: inline `<span>` with Tailwind classes from color maps above. Pattern: `rounded-full px-2.5 py-0.5 text-xs font-medium`.
- **Breadcrumb pattern**: `<Breadcrumb items={[...]} className="mb-2" />` at top of every dashboard page.

## Work Order Types (`src/types/work-order.ts`)
- `WorkOrderStatus`: new, assigned, in_progress, completed, needs_follow_up, estimate_needed, cancelled
- `Priority`: low, normal, high, urgent
- `ServiceCategory`: 10 values — weekly_pool_maintenance, pool_repair, pool_inspection_diagnostic, filter_cleaning, heater_service, equipment_installation, pool_remodel, new_construction, emergency_service, other
- `EstimateHandoffStatus`: not_needed, flagged, sent_to_ghl, estimate_sent, approved, declined
- `WorkOrder.ghl_sync_failed?: boolean` — set true when outbound GHL sync failed after all retries; cleared on next successful sync
- `WorkOrderWithRelations`: extends WorkOrder + `property_address`, `property_customer_name`, `assigned_technician_name?`
- `WORK_ORDER_STATUS_TRANSITIONS`: use this for validation everywhere

## Visit Types (`src/types/visit.ts`)
- `VisitStatus`: scheduled, in_progress, completed, skipped, rescheduled, cancelled
- `ChecklistItem`: id, label, completed, notes?
- `Visit`: id, tenant_id, work_order_id, property_id, technician_id?, status, scheduled_date, checklist, technician_notes?, photo_urls, completed_at?, estimate_flagged, created_at, updated_at
- `CreateVisitInput`: omits id/created_at/updated_at
- `UpdateVisitInput`: partial of CreateVisitInput

## GHL Boundaries (Do Not Cross)
GHL handles: CRM, contacts, conversations, forms, lead capture, pipelines, calendars, SMS/email, marketing automations.
ServiceOps handles: work orders, visits, property profiles, technician workflow, checklists, photos, notes, completion reports.

## Confirmed Client Context
- Client: Showtime Pool Service, California
- Current stack: GoHighLevel
- Service type: Pool service (weekly maintenance, repairs, emergency, equipment installs)
- Team: Owner + technicians in the field
- Needs: Work orders, job checklists, field photos, service history per property

## Dependencies Installed
- `next` 15, `react` 18, `typescript` 5, `tailwindcss` 3.4
- `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`
- `zod` (v4)

## Open Questions
- Which GHL plan does Showtime use? (affects API access tier)
- GHL OAuth vs Private Integration Token?
- Photo storage: Supabase Storage, AWS S3, or Cloudinary?
- Recurring visits: GHL calendar sync or internal schedule?
- Estimate handoff: create new GHL opportunity or update existing?
- GHL pipeline stage names for Showtime Pools — must confirm before going live (all stage names in mapping docs are illustrative)
- GHL custom field IDs for gate_code, access_notes, service_notes, scheduled_date, service_category, priority — must retrieve from client's GHL account
- Phase 5 remaining: ContactCreate/ContactUpdate → Property upsert handler not yet implemented (only OpportunityStatusChange is wired)
- Phase 5 remaining: AppointmentBooked handler not yet implemented
- Phase 6 remaining: Retry queue is in-memory — needs persistent backing (DB table or Redis) before production
- Phase 6 remaining: `ghl_sync_failed` flag not yet surfaced in the admin dashboard UI
- Phase 6 remaining: `waitUntil()` wrapper for serverless deployments not yet added to the PATCH route

## Detailed Memory Files Location
- memory/product-decisions.md — architecture and product decisions
- memory/confirmed-facts.md — confirmed client/business facts
- memory/assumptions.md — unconfirmed working assumptions
- memory/glossary.md — term definitions
- memory/client-showtime-pools.md — client-specific notes
- memory/ghl-rules.md — GHL integration rules
- memory/technical-decisions.md — tech stack decisions
- memory/open-questions.md — questions to resolve
