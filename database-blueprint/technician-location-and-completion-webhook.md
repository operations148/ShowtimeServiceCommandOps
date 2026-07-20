# Database Blueprint — Technician Location & Completion Webhook (Phase 12)

Migration: `supabase/migrations/20260719000001_phase12_location_and_completion_webhook.sql` (additive; **not applied** until approved). Rationale: ADR-0018.

## Altered tables

### `tenants`
| Column | Type | Notes |
|---|---|---|
| `ghl_completion_webhook_url` | `TEXT` null | The GHL **Inbound Webhook trigger URL** the client pastes from their review-request workflow. Null = payload step skipped (opportunity→won sync still runs). Owner-set via company settings (`canManageSettings`). |

### `properties`
| Column | Type | Notes |
|---|---|---|
| `latitude` | `DOUBLE PRECISION` null | Geocoded from the address via Nominatim, **cached forever** (re-geocoded only when the address changes) |
| `longitude` | `DOUBLE PRECISION` null | |
| `geocoded_at` | `TIMESTAMPTZ` null | When the cached coordinates were resolved; null = never attempted or address changed since |

## New table

### `technician_locations` — last-known position, ONE row per technician (ADR-0018 §2)
| Column | Type | Notes |
|---|---|---|
| `technician_id` | `UUID` PK, FK→technicians cascade | **Primary key = upsert-in-place; the table cannot grow a history** |
| `tenant_id` | `UUID` NOT NULL FK→tenants cascade | |
| `latitude` | `DOUBLE PRECISION` NOT NULL | |
| `longitude` | `DOUBLE PRECISION` NOT NULL | |
| `accuracy_m` | `REAL` null | Browser-reported accuracy radius, meters |
| `recorded_at` | `TIMESTAMPTZ` NOT NULL | Client capture time; freshness is computed against this and ALWAYS displayed |
| `updated_at` | `TIMESTAMPTZ` NOT NULL default now() | Server write time |

Index: `(tenant_id)`. No history table by design — deliberate privacy decision, not an omission.

## RLS

`technician_locations` RLS-enabled, same `DO $$` pattern: tenant-scoped SELECT; write policy includes `technician` (techs post their own pings; the API layer forces `technician_id` = caller's own). Service-role app layer remains the active control.

## Writers / readers

- `POST /api/tech/location` — technician-scoped upsert of own row (kill-switch + throttle client-side).
- `GET /api/work-orders/[id]/map-context` — dispatch roles (`canViewSchedule`): property coords (geocoding on-demand if missing) + assigned technician's last-known row.
- Completion webhook reads `tenants.ghl_completion_webhook_url`; delivery goes through the existing `ghl_sync_outbox` with new `job_type = 'completion_webhook'` (payload + URL stored on the row for durable retry).

## Rollback

Additive. Drop `technician_locations`, then the three `properties` columns and `tenants.ghl_completion_webhook_url`. Outbox rows with the new job_type drain to a no-op if the code is reverted (unknown-type rows error out and stay visible rather than being lost).
