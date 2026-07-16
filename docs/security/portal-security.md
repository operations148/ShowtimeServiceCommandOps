# Customer Portal — Security Model (Phase 7)

Companion to ADR-0014. This is the threat-and-control reference for the customer portal. The portal is the second unauthenticated-facing surface (after public document tokens) and the **first persistent customer identity**, so it gets its own security doc.

## Trust boundaries

| Principal | Auth | Session | Authorization |
|---|---|---|---|
| Staff | NextAuth (password, bcrypt-12) + middleware | JWT + DB trusted-context re-validation | Role permissions (`src/config/roles.ts`) |
| **Portal customer** | Passwordless magic link | DB-backed revocable session, re-validated every request | Property-scoped grants (`portal_customer_properties`) |
| Anonymous token holder | Hashed one-time document token | None (stateless) | The token *is* the grant (one document) |

Staff auth and portal auth are separate systems by design. The NextAuth middleware matcher (`/dashboard`, `/tech`, `/login`) excludes `/portal`; portal routes enforce auth per-route via `requirePortalAuth()`.

## Controls by threat

### T1 — Credential theft / leaked database
- **No customer passwords exist** (magic-link only) — nothing to crack or reuse.
- Magic-link tokens and session tokens are **stored only as SHA-256 hashes** (unique indexes on `token_hash`). A DB dump yields no usable link or session.

### T2 — Magic-link replay / interception
- **One-time**: consumption is an atomic `UPDATE ... SET consumed_at = now() WHERE consumed_at IS NULL`; a replay loses the race and is inert.
- **Short-lived**: 20 min for login, 72 h for invite.
- **Scanner-safe**: the GET that opens `/portal/auth/[token]` does not consume; a client-side POST does. Email link-prefetchers (no JS) can't burn the token before the human clicks.

### T3 — Session hijack / stale session after access change
- Session validity is re-derived from the DB on **every** request: not `revoked_at`, not expired, customer `is_active`, `session_version` matches. So:
  - Revoke one device → `revoked_at` → dead next request.
  - Sign out everywhere / deactivate → `session_version` bump → all sessions dead at once.
  - Revoke access → `is_active = false` → locked out next request, and can't mint new links.
- Cookie is httpOnly; token is opaque 256-bit random.

### T4 — Horizontal privilege escalation (see another customer's data)
- **Every** read is scoped to the customer's granted property ids; **every** action calls `assertPropertyAccess(context, propertyId)` before domain logic.
- A guessed/enumerated document id whose property isn't granted returns the **same generic not-found** as a missing row — no existence oracle.
- Cross-tenant is impossible: context's `tenantId` comes from the session row, and all queries filter by it.

### T5 — Account enumeration
- The login endpoint's response is identical whether the email matches zero, one, or many accounts. The UI never reveals match count.

### T6 — Price/amount tampering at payment
- Portal payment reuses `createInvoiceCheckoutSession`; amount, currency, tenant, and invoice are **server-owned** (ADR-0013 §2). The request body carries only `deposit` | `balance`. The Stripe webhook re-verifies against server-resolved rows (ADR-0013 §3).

### T7 — Data leakage through serialization
- Documents serialize through allowlist types (`PublicEstimate`/`PublicChangeOrder`/`PublicInvoice`) — internal costs, staff ids, internal notes, pricebook pointers are structurally absent.
- Property summaries omit gate codes, access notes, service notes, equipment internals.

### T8 — Sensitive data left on shared/lost device
- `Cache-Control: no-store, no-cache, must-revalidate, private` on `/portal/*` and `/api/portal/*` (next.config `headers()`), so browsers/proxies/bfcache don't retain portal responses.
- Sign-out clears the Cache Storage API (`caches.delete` for all keys).
- The service worker precaches **static JS/CSS only** — never portal HTML or API responses.
- Portal pages are `robots: noindex, nofollow`.

### T9 — Abuse / brute force of the email→link surface
- Postgres-backed rate limits: `portalLinkRequest` 5/hr, `portalAuth` 10/hr, `portalView` 60/min, `portalAction` 20/hr.

## Admin management controls
- All `/api/portal-users/*` routes require `canManagePortalUsers` (platform_owner + tenant_admin only), enforced server-side; the nav entry mirrors this but is not the control.
- Invite verifies every requested property belongs to the acting tenant before granting.
- Admin actions (invite, update, revoke access, resend, revoke sessions) write both a `portal_events` row and a staff `audit_events` row.

## Audit trail
Every security-relevant portal event is recorded in `portal_events` (customer-side) and, for staff-initiated actions, `audit_events` (staff-side). See `docs/security/audit-event-catalog.md`.

## Residual risks / follow-ups
- **Email deliverability & preview mode**: customer email defaults to preview (no real send) until the client approves live sends — same gate as estimates. Live magic links depend on the mailer being configured.
- **RLS is defense-in-depth only**: the service-role client bypasses RLS; property-scoped app-layer checks are the active control. A future move to per-request DB roles would make RLS a hard backstop.
- **No customer MFA**: acceptable for this audience (magic link is itself possession-based), revisit if the portal ever holds higher-sensitivity data.
