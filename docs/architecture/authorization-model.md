# Authorization Model — Post-Phase 1

_Describes the trusted authorization context introduced in Phase 1, superseding the pre-Phase-1 model documented in `docs/architecture/current-state.md`._

## Trusted authorization context

Every authenticated request resolves a `TrustedContext` (`src/lib/auth/trusted-context.ts`):

```ts
interface TrustedContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  technicianId?: string;
  requestId: string;
}
```

`resolveTrustedContext(session, requestId)`:
1. Re-fetches `id, tenant_id, role, is_active, session_version` from the `users` table by the JWT's `id` claim — **never trusts the JWT's own `role`/`tenant_id` claims for the authorization decision**, only as a lookup key.
2. Rejects (generic 401, no detail on which check failed) if the user is not found, `is_active = false`, or `session_version` doesn't match the value the JWT was issued with.
3. On success, the caller (`requireApiAuth`/`requireAuth`) overwrites `session.user.tenant_id`/`role`/`technician_id` with the fresh DB values before returning — every existing call site across all 35 API routes and every server-component page automatically authorizes against current data, with no call-site changes required.

This closes the pre-Phase-1 gap where deactivating a user or changing their role had no effect until their JWT's 8-hour `maxAge` naturally expired (security-audit H2).

## Session revocation (`session_version`)

- `users.session_version` (migration `20260711000001`), starts at 1, incremented via `bumpSessionVersion(userId, tenantId)` whenever: an admin changes a user's `role` or `is_active` state (`PATCH /api/team/[id]`, `PATCH /api/technicians/[id]`), a user completes a password reset (self-service or invitation acceptance).
- The JWT captures `session_version` at login time (`jwt`/`session` callbacks in `src/lib/auth/config.ts`). A mismatch against the current DB value invalidates every session issued before the bump — including sessions on other devices/browsers, which is the point (a password reset should log out anyone who had the old password).

## Same-origin validation

`requireApiAuth()` also calls `isSameOriginRequest()` (`src/lib/security/origin.ts`) before resolving the session: if the request carries an `Origin` header that doesn't match its own `Host`, it's rejected with a generic 403 regardless of whether a valid session cookie was attached. Requests with no `Origin` header (some same-origin non-fetch calls) are allowed through, relying on `SameSite=Lax` as the remaining layer for that case.

## Route-level enforcement, unchanged in shape

`requireApiAuth()` → `requireApiRole(...)` / `requirePermission(flag)` remain the three entry points every route uses, now all routed through the trusted-context resolution above. `rolePermissions` (`src/config/roles.ts`) is the single source of truth for what each of the 5 roles can do — see ADR-0003 for why it was extended rather than replaced with a fully granular per-resource model.

## What Phase 1 did *not* change

- RLS policies remain enabled-but-currently-unreachable for application traffic (the service-role client bypasses them by design — see `docs/architecture/erd.md`'s RLS caveat). Phase 1 fixed one incorrect policy (`work_orders_update` wrongly granting `read_only_owner` UPDATE) as a correctness fix, but did not undertake wiring RLS to actually gate the service-role path, which would require a larger architectural change (moving off the service-role client, or adopting `SET LOCAL`-based session variables per request) not scoped to this phase.
- The identity model (tenant-scoped `users`, no cross-tenant memberships) is unchanged — see ADR-0002.
- No new roles were added; the 5-role model (`PLATFORM_OWNER`, `TENANT_ADMIN`, `OFFICE_STAFF`, `TECHNICIAN`, `READ_ONLY_OWNER`) is unchanged.
