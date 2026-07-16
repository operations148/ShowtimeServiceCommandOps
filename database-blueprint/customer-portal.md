# Database Blueprint — Customer Portal (Phase 7)

Migration: `supabase/migrations/20260715000001_phase7_customer_portal.sql` (additive; **not yet applied** — application requires explicit approval, same posture as prior phases).

All money elsewhere is integer cents (`src/lib/money/money.ts`); the portal tables hold no money. Every table carries `tenant_id` and is RLS-enabled (defense-in-depth; the service-role app layer is the active control). Types: `src/types/portal.ts`.

## Tables

### `tenants` (altered)
| Column | Type | Notes |
|---|---|---|
| `portal_booking_url` | `TEXT` null | Deep link to the tenant's approved GHL booking flow. When set, the portal shows "Book a Visit" → this URL. The portal never builds its own booking engine. |

### `portal_customers` — the customer identity (separate from `users`, ADR-0014 §1)
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `tenant_id` | `UUID` FK→tenants, cascade | |
| `email` | `TEXT` | `UNIQUE(tenant_id, email)`; same email may exist in multiple tenants independently |
| `name` | `TEXT` | |
| `phone` | `TEXT` null | |
| `ghl_contact_id` | `TEXT` null | Optional soft link to the GHL contact this portal user represents |
| `is_active` | `BOOL` = true | `false` = deactivated; fails the auth active-check on the next request and can't request links |
| `session_version` | `INT` = 1 | Bump to revoke ALL sessions at once (mirrors `users.session_version`) |
| `last_login_at` | `TIMESTAMPTZ` null | |
| `invited_by` | `UUID` FK→users, set null | Staff who invited |
| `created_at`/`updated_at` | `TIMESTAMPTZ` | `updated_at` trigger |

Indexes: `(tenant_id)`, `(tenant_id, lower(email))`.

### `portal_customer_properties` — property-scoped access (many-to-many)
| Column | Type | Notes |
|---|---|---|
| `portal_customer_id` | `UUID` FK→portal_customers, cascade | PK part |
| `property_id` | `UUID` FK→properties, cascade | PK part |
| `tenant_id` | `UUID` FK→tenants, cascade | Denormalized for RLS + query scoping |
| `created_at` | `TIMESTAMPTZ` | |

PK `(portal_customer_id, property_id)`. Indexes: `(property_id)`, `(tenant_id)`. **This join is the authorization boundary** — every portal read/action is scoped to the customer's rows here.

### `portal_magic_links` — passwordless login tokens (ADR-0014 §2)
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `portal_customer_id` | `UUID` FK, cascade | Link is bound to one customer (hence one tenant) |
| `tenant_id` | `UUID` FK, cascade | |
| `token_hash` | `TEXT` | SHA-256 of the emailed token; **unique index**; plaintext never stored |
| `purpose` | `TEXT` = 'login' | CHECK in (`login`, `invite`); invite links have 72h TTL vs 20min login |
| `expires_at` | `TIMESTAMPTZ` | |
| `consumed_at` | `TIMESTAMPTZ` null | One-time: atomic `UPDATE ... WHERE consumed_at IS NULL` claim |
| `requested_ip` | `TEXT` null | |
| `created_at` | `TIMESTAMPTZ` | |

Indexes: unique `(token_hash)`, `(portal_customer_id, created_at DESC)`.

### `portal_sessions` — revocable sessions (ADR-0014 §4)
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `portal_customer_id` | `UUID` FK, cascade | |
| `tenant_id` | `UUID` FK, cascade | |
| `token_hash` | `TEXT` | SHA-256 of the opaque cookie bearer token; **unique index** |
| `session_version` | `INT` | The customer's `session_version` at issue time; mismatch = revoked |
| `issued_at` | `TIMESTAMPTZ` | |
| `expires_at` | `TIMESTAMPTZ` | |
| `revoked_at` | `TIMESTAMPTZ` null | Per-session revoke |
| `last_seen_at` | `TIMESTAMPTZ` null | Updated on activity |
| `ip` / `user_agent` | `TEXT` null | Shown on the customer's Security page + admin review |

Indexes: unique `(token_hash)`, `(portal_customer_id, issued_at DESC)`. Validity on each request = not revoked AND not expired AND customer active AND `session_version` matches.

### `portal_events` — append-only portal audit log
| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `tenant_id` | `UUID` FK, cascade | |
| `portal_customer_id` | `UUID` FK, set null | |
| `event_type` | `TEXT` | CHECK list: `invited`, `link_requested`, `link_sent`, `logged_in`, `login_failed`, `signed_out`, `session_revoked`, `sessions_revoked_all`, `access_revoked`, `profile_updated`, `estimate_accepted`, `estimate_declined`, `change_order_accepted`, `change_order_rejected`, `invoice_paid`, `document_downloaded` |
| `actor_user_id` | `UUID` FK→users, set null | Staff actor for admin-initiated actions |
| `ip` / `user_agent` | `TEXT` null | |
| `metadata` | `JSONB` null | |
| `created_at` | `TIMESTAMPTZ` | |

Indexes: `(portal_customer_id, created_at DESC)`, `(tenant_id, created_at DESC)`. Admin-side actions also write a staff `audit_events` row (see `docs/security/audit-event-catalog.md`).

## RLS

All five tables `ENABLE ROW LEVEL SECURITY`. A `DO $$ FOREACH` loop creates, per table: a `SELECT` policy `USING (tenant_id = current_tenant_id())` and an `ALL` write policy additionally requiring `current_user_role() IN ('tenant_admin','office_staff','platform_owner')`, plus `GRANT ... TO service_role, authenticated`. `portal_customer_properties` carries `tenant_id` specifically so it participates in this loop. Portal customer requests run through the service-role app layer where property-scoped authorization (not RLS) is the active control.

## Relationships

```
tenants 1─┬─* portal_customers 1─┬─* portal_customer_properties *─1 properties
          │                      ├─* portal_magic_links
          │                      ├─* portal_sessions
          │                      └─* portal_events
          └─ portal_booking_url (column)
users 1─* portal_customers.invited_by / portal_events.actor_user_id
```

## Rollback

Additive only. While unused, drop in reverse dependency order: `portal_events`, `portal_sessions`, `portal_magic_links`, `portal_customer_properties`, `portal_customers`, then the `tenants.portal_booking_url` column.
