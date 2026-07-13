# Tenant Isolation Test Plan

_Per `.claude/rules/testing-rules.md`: "Tenant isolation tested with two test tenants." This plan defines that test setup and the specific checks to run against it. Currently manual — automating this (Vitest + a seeded second tenant) is a natural Phase 1 CI addition once the test framework matures beyond this phase's unit-level coverage._

## Setup

Create a second tenant (`tenant-b`) alongside the existing production/dev tenant (`a0000000-0000-0000-0000-000000000001`, "Showtime Pool Service"), with:
- One user per role (`TENANT_ADMIN`, `OFFICE_STAFF`, `TECHNICIAN`, `READ_ONLY_OWNER`) in Tenant B.
- At least one property, work order, visit, and recurring schedule in Tenant B, with IDs recorded for cross-tenant probing.

## Checks

For every resource type, log in as a Tenant A user and attempt to access a Tenant B resource by ID (and vice versa). Expected result for all: **404 or 422 ("not found"), never a 200 with the other tenant's data, and never a 403 that confirms the resource exists but is forbidden** (a 403 in this context would itself be an information leak — it confirms the ID is valid, just belonging to someone else).

| Resource | Route | Expected on cross-tenant ID |
|---|---|---|
| Work order | `GET/PATCH/DELETE /api/work-orders/[id]` | 404 |
| Property | `GET/PATCH /api/properties/[id]` | 404 |
| Visit | `GET/PATCH /api/visits/[id]` | 404 |
| Visit photos | `GET/POST/DELETE /api/visits/[id]/photos` | 404 (visit lookup fails first) |
| Recurring schedule | `PATCH/DELETE /api/recurring-schedules/[id]` | 404 |
| Team member | `GET/PATCH/DELETE /api/team/[id]` | 404 |
| Technician | `GET/PATCH /api/technicians/[id]` | 404 |
| Estimate handoff (via work order) | `PATCH /api/work-orders/[id]` with estimate fields | 404 (work order lookup fails first) |
| Invitation acceptance | `POST /api/invitations/accept` with a Tenant B invite token, attempted while it's unexpired | Should succeed (tokens aren't tenant-scoped by the caller's session — there is no caller session at accept time; token possession is the credential) — confirm the created session then correctly reflects Tenant B, not Tenant A |
| Password reset | `POST /api/auth/password-reset/confirm` | Same as above — token possession is the credential, tenant is derived from the token's owner, not any ambient session |

## Cross-tenant creation attempts (POST body references another tenant's resource)

| Scenario | Route | Expected |
|---|---|---|
| Create visit referencing Tenant B's `work_order_id` while authenticated as Tenant A | `POST /api/visits` | 422 "work_order_id not found for this tenant" (Phase 1 fix — see security-audit M8) |
| Create visit referencing Tenant B's `property_id` while authenticated as Tenant A | `POST /api/visits` | 422 "property_id not found for this tenant" |
| Create visit with `technician_id` belonging to Tenant B while authenticated as Tenant A admin | `POST /api/visits` | 422 "technician_id not found for this tenant" |

## Session/JWT tenant confusion

| Scenario | Expected |
|---|---|
| Tenant A admin's JWT is replayed against a request after their `tenant_id` somehow changed server-side (shouldn't be possible via any UI, but test the trusted-context path directly) | `resolveTrustedContext` re-fetches `tenant_id` fresh from the DB every request — the JWT's original `tenant_id` claim is never trusted for authorization, only `id`. Confirm by manually editing a user's `tenant_id` in the DB (test env only) and confirming their *next* request reflects the new tenant, proving the DB is authoritative, not the token. |

## RLS-specific note

Per `docs/architecture/erd.md` and `docs/architecture/threat-model.md`, RLS is currently **not** the enforcement mechanism for any of the above (all application traffic uses the service-role client, which bypasses RLS). This test plan verifies the **application-layer** enforcement (`getTenantId` + trusted context + explicit `.eq("tenant_id", ...)` on every query). If/when a future phase makes RLS reachable (e.g., via Supabase Auth adoption or `SET LOCAL` session variables), this same test plan should be re-run against direct anon-key access as an additional, independent verification layer.
