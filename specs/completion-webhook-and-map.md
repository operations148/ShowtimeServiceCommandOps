# Spec — Completion Webhook & Technician Location Map (Phase 12)

**Status:** Code-complete (branch `feat/serviceops-phase-12-completion-webhook-map`, not merged/deployed)
**Related:** ADR-0018, `database-blueprint/technician-location-and-completion-webhook.md`

Two client-driven capabilities, both grounded in the Markate capability reference (`docs/audits/markate-gap-analysis.md`, `markate_report.md`) but scoped to ServiceOps' PWA + GHL-source-of-truth boundaries.

## A. Completion → GHL review-workflow webhook

### The bug this fixes
`syncCompletionToGhl` only fired from the **admin** work-order PATCH route. The technician mobile completion path updated the work order via a direct DB write and **never notified GHL** — so the majority of real completions (field techs) never triggered the client's review workflow. Verified by grep: the visit route had no GHL import.

### What ships
- **Both completion paths now fire the sync.** The visit-completion path runs it in `after()` (post-response, non-blocking), gated on the actual transition into COMPLETED so re-saving an already-complete job doesn't re-fire.
- **New completion payload webhook.** `syncCompletionToGhl` POSTs a flat JSON payload to the tenant's **GHL Inbound Webhook trigger URL** (`tenants.ghl_completion_webhook_url`): event, `ghl_contact_id`/`ghl_opportunity_id`, WO number/title/category, customer name, property address, completed-by/at, completion message, tenant name. The client's GHL workflow matches on contact/opportunity and fires the Google-review request.
- **Independent + durable.** The payload step runs even for manually-created jobs (no GHL opportunity — matches on name/address); a failure enqueues to the existing GHL outbox (`job_type: 'completion_webhook'`) and is retried with backoff by the drain cron. No URL configured → skipped silently.
- **SSRF guard:** only `https://` URLs are ever sent (settings validator + sender both enforce).
- **Config:** owner sets the URL in Settings → Company → "Review Webhook URL".

### Boundary respected
ServiceOps reports the operational fact only; **GHL owns the customer messaging** (the review request). This is a status/event notification, not a message ServiceOps sends.

## B. Technician location map

### Honest constraints (ADR-0018 §2)
ServiceOps is a **PWA** (native apps are an explicit product exclusion). Browsers give geolocation **only while the app is foreground**. So:
- **Capture:** `TechLocationReporter` (mounted in the tech shell) posts a throttled (~60s) last-known position to `POST /api/tech/location` while the tech app is open. A tech can only ever write **their own** row (`technician_id` from session, never the body).
- **Storage:** `technician_locations`, **one row per technician** (PK = technician_id) — last-known only, **no breadcrumb history** by design (surveillance-grade retention no one asked for).
- **Display:** the work-order detail map (`WorkOrderMap`) shows the property pin + the assigned tech's last-known pin, **with an always-visible freshness label** (live ≤2 min / recent ≤15 min / stale). A stale position is never dressed up as live.
- **Visibility:** dispatch roles only (`canViewSchedule`); techs never see each other.
- **Kill-switch:** `NEXT_PUBLIC_TECH_LOCATION_ENABLED` (default on) disables capture + display.

### Maps stack
- **Leaflet + OpenStreetMap tiles** — no Google Maps key/billing. Vanilla Leaflet loaded dynamically client-side (no SSR); `divIcon` markers (no broken image-asset paths, no external images beyond tiles). CSP gains one `img-src` entry (`*.tile.openstreetmap.org`).
- **Geocoding:** server-side OSM **Nominatim**, one lookup per property, **cached** in `properties.latitude/longitude`; re-geocoded only when the address changes (cache invalidated in `updateProperty`). Usage-policy compliant (identified UA, on-demand single lookups, cached — never bulk). Un-geocodable address → no map (never a wrong pin).
- **Directions:** a plain Google Maps *link* (no key needed) for turn-by-turn — rendering and navigation are separate problems.

## API summary
| Route | Method | Gate |
|---|---|---|
| `/api/tech/location` | POST | technician (own row only); kill-switch |
| `/api/work-orders/[id]/map-context` | GET | `canViewSchedule`; returns partial data gracefully |
| `/api/settings/company` | PATCH | +`ghl_completion_webhook_url` (https-validated) |

## Tests
`src/lib/ghl/completion-webhook.test.ts` (payload builder), `src/lib/geo/geo.test.ts` (address query, Nominatim parse, freshness boundaries — the "never present stale as live" rule). Pure logic only; network/DB wrappers are thin.

## Out of scope
- Background/continuous tracking (impossible in a PWA without native apps — an explicit product exclusion).
- Location history / breadcrumb trails (deliberate privacy decision).
- Route optimization / multi-stop planner (a separate, larger feature).

## Deploy notes
Migration `20260719000001` (additive). Client pastes their GHL Inbound Webhook URL into settings. `NEXT_PUBLIC_TECH_LOCATION_ENABLED` unset = on. First map view of each property triggers a one-time geocode (brief delay), then cached.
