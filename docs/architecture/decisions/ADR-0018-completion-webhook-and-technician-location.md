# ADR-0018 — Completion Webhook to GHL & PWA-Honest Technician Location

**Status:** Accepted (Phase 12, 2026-07-19)

## Context

Two client-driven needs surfaced after launch-readiness:

1. **The client's GHL account runs a Google-review-request workflow that must fire when a job completes.** Verification found the existing completion sync (`syncCompletionToGhl`) has a critical gap: it only fires from the *admin* work-order PATCH route. The technician mobile path — the way most jobs actually complete — updates the work order through a direct DB call and **never notifies GHL**. It also sends no payload (just opportunity → "won"), while the client's workflow needs work-order/customer details via a **GHL Inbound Webhook trigger**.
2. **A live map**: click a work order → see the property and where the assigned technician is. Markate (the capability reference) documents schedule map views, a route planner, GPS navigation, and employee location pings — but Markate has **native apps**, which allow background location. ServiceOps is a PWA by explicit product rule; browsers only provide geolocation **while the app is open in the foreground**.

## Decisions

### 1. Completion sync fires from BOTH completion paths, payload included

The visit-completion path (tech mobile) now triggers the same `syncCompletionToGhl` as the admin path, after the work-order transition succeeds. The sync does two things, each independently durable via the existing GHL outbox:
- **Opportunity → "won"** (unchanged behavior).
- **NEW: POST a completion payload** to a tenant-configured **GHL Inbound Webhook URL** (`tenants.ghl_completion_webhook_url`). Payload carries what a review workflow needs to match and personalize: `ghl_contact_id`, `ghl_opportunity_id`, work-order number/title/category, property address, customer name, completed-by/at, and the completion message. No payload URL configured → step is skipped silently (not an error).

**Why an Inbound Webhook URL rather than tags/custom fields:** it is the GHL-native trigger the client already built their workflow around; it delivers the full payload in one call; and it respects the boundary that **GHL owns customer messaging** — ServiceOps only reports the operational fact "job completed."

**Duplicate-fire guard:** the webhook fires only on the *transition* into COMPLETED (both paths already detect `completedNow`/`statusBecameCompleted`). A reopened-then-recompleted job fires again by design — that is a genuinely new completion; the client controls re-entry rules inside the GHL workflow.

### 2. Technician location is last-known-only, foreground-only, and honest about it

- **Capture:** while a technician has the tech app open, the browser's geolocation (permission-prompted) posts a throttled ping (~60s) to `POST /api/tech/location`. A technician can only ever report **their own** position (server forces `technician_id` from the session).
- **Storage: one row per technician** (`technician_locations`, upserted last-known position: lat, lng, accuracy, recorded_at). **No movement history, no breadcrumb trail** — deliberately. A trail is surveillance-grade data with retention/consent obligations no one asked for; dispatch needs "where are they *now*," not "where were they at 2:14."
- **Display:** the work-order detail map shows the property pin and the assigned technician's last-known pin **with a freshness label** ("2 min ago" / "stale — 3 h ago"). Staleness is rendered, never hidden — a last-known position presented as live would be a lie the dispatcher acts on.
- **Visibility:** dispatch-level roles only (`canViewSchedule`); technicians never see each other's positions.
- **Kill-switch:** `NEXT_PUBLIC_TECH_LOCATION_ENABLED` (default on) disables capture and display without a code change — same pattern as the offline layer (ADR-0015).

### 3. Maps: Leaflet + OpenStreetMap; geocoding via Nominatim, cached forever

- **No Google Maps API key/billing.** Leaflet + OSM tiles are free, interactive, and CSP-friendly (one `img-src` addition). The client can navigate to a job via a plain Google Maps *link* (no key needed) — rendering and navigation are different problems.
- **Geocoding is server-side via OSM Nominatim**, one lookup per property, **cached in `properties.latitude/longitude`** (usage-policy compliant: identified User-Agent, cached results, on-demand single lookups — never bulk loops). A property whose address can't geocode simply shows no map rather than a wrong pin.

## Consequences

- The client must create the GHL workflow (Inbound Webhook trigger) and paste its URL into ServiceOps company settings — a config step, like Stripe keys.
- The map's honesty constraint is permanent for a PWA: no background tracking without native apps (an explicit product exclusion). If the client ever needs true continuous tracking, that is a native-app conversation, not a web feature.
- `technician_locations` holds live PII: RLS'd, role-gated, one row per tech, overwritten in place.

## Alternatives considered

- **Tag-based GHL triggering** (add "job-completed" tag to contact) — workable but lossy (no payload) and mutates CRM data ServiceOps doesn't own; rejected in favor of the webhook the client already designed around.
- **Location breadcrumb history** — rejected (Decision 2): surveillance-grade retention burden, zero dispatch value over last-known.
- **Google Maps JS SDK** — rejected: API key + billing + CSP script-src widening for no functional gain at this scale.
