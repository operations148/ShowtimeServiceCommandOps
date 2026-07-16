# ADR-0014 — Customer Portal Identity, Passwordless Auth, and Property-Scoped Authorization

**Status:** Accepted (Phase 7, 2026-07-16)

## Context

Every phase up to now served *staff*: platform owners, tenant admins, office staff, and technicians, all authenticated through NextAuth against the `users` table. Phase 7 opens a second, fundamentally different audience — the tenant's own **customers** — who need to sign in and see only their own estimates, invoices, change orders, and service history. This is the first identity in the system that is neither staff nor an anonymous holder of a one-time public token (ADR-0007).

The product boundary matters here: GHL owns contacts, messaging, booking, and marketing (see `product-boundaries.md`). The portal is *not* a CRM, a booking engine, or a messaging tool. It is a read-and-approve surface over documents ServiceOps already owns, plus card payment via the Phase 6 rails. "Book a visit" links out to the tenant's GHL booking URL; it never builds its own.

This ADR fixes how a customer proves who they are and what they're allowed to see.

## Decisions

### 1. Portal customers are a separate identity from staff `users`

`portal_customers` is its own table, never a row in `users`. A staff member and a customer are different kinds of principal with different auth, different session storage, different authorization, and different blast radius if compromised. Conflating them into one table with a role flag would put customer credentials one bug away from staff access. They share nothing but foreign keys. `UNIQUE(tenant_id, email)` means the same email can be a portal customer in two tenants independently — the login flow (below) accounts for this.

### 2. Passwordless magic-link authentication — no customer passwords, ever

Customers never set a password. To sign in they enter their email; the server issues a short-lived, single-use **magic link**. Rationale: customers log in rarely, a password they set once and forget is a support burden and a breach liability, and we already send transactional email. Storing no customer password means there is no customer password to leak.

- **Token at rest is a SHA-256 hash.** The emailed token is 256-bit random; only its hash is stored (`portal_magic_links.token_hash`, unique index). A database read never yields a usable link. Same pattern as the public estimate/invoice tokens (ADR-0007), reused deliberately.
- **One-time, via an atomic claim.** Consumption is `UPDATE ... SET consumed_at = now() WHERE consumed_at IS NULL` — the row is claimed by exactly one request; a replay finds `consumed_at` already set and is rejected. No check-then-write race.
- **Short TTL.** Login links live 20 minutes; admin *invite* links live 72 hours (a customer may not act on an invite immediately). `purpose` (`login` | `invite`) distinguishes them.
- **The link is consumed by a client-side POST, not the GET that opens it.** Email scanners and link prefetchers issue GETs without running JS. If the GET burned the token, a scanner would consume the link before the human clicked. Instead `/portal/auth/[token]` renders, then JavaScript POSTs the token to exchange it for a session. Scanners don't run JS, so the one-time token survives to the real click.

### 3. Login spans tenants; each issued link is tenant-scoped

At the email prompt the server does not yet know which tenant the customer belongs to (email is unique per tenant, not globally). So `getActivePortalCustomersByEmail` matches across tenants and issues **one link per active match**, each bound to a specific `portal_customer_id` (hence a specific tenant). The customer clicks whichever tenant's link they meant. We never reveal in the UI how many matched — the response is the same whether zero, one, or several accounts exist (no account-enumeration oracle).

### 4. Sessions are DB-backed and revocable, re-validated on every request

A successful magic-link exchange issues a `portal_sessions` row and sets an **opaque 256-bit bearer token** in an httpOnly cookie (`portal_session`); the server stores only the token's SHA-256 hash (`token_hash`, unique index), never the token itself — the same `generatePublicToken`/`hashPublicToken` primitives the public document tokens use. There is no separate signing secret to manage: the token is unguessable random, and the hash lookup is the verification. This is **not** a stateless JWT, deliberately. On every authenticated request `resolvePortalSession` re-reads the row and requires *all* of: not `revoked_at`, not past `expires_at`, the owning `portal_customers` row still `is_active`, and the row's `session_version` still equals the customer's current `session_version`. 

The consequence is that revocation is immediate, not "immediate at next token expiry":
- **Per-device sign-out** sets `revoked_at` on one session (customer's Security page, or admin).
- **Sign out everywhere** bumps `portal_customers.session_version` — every existing session's stored version no longer matches, so all are dead at once (admin "revoke sessions", or on deactivation).
- **Revoke access** sets `is_active = false` — the customer fails the active check on the very next request *and* can no longer request new links.

This mirrors the staff trusted-context pattern (`src/lib/auth/trusted-context.ts`) — authorization is never trusted from a token alone; it is re-derived from the database on each request.

### 5. Authorization is property-scoped, enforced on every read and action

A portal customer is granted access to a set of **properties** (`portal_customer_properties`, many-to-many). Every document the portal exposes hangs off a property, so every query is scoped to the customer's granted property ids and every action gates on `assertPropertyAccess(context, propertyId)` *before* touching domain logic. A customer with access to property A can never see or act on property B's documents, even by guessing an id — the id resolves, its property is checked, and a mismatch returns the same generic not-found as a truly missing row (no existence oracle).

### 6. The portal reuses domain logic; it never reimplements it

Accept/decline/pay are not new business logic. The portal routes call the exact same `acceptEstimate` / `declineEstimate` / `acceptChangeOrder` / `rejectChangeOrder` / `createInvoiceCheckoutSession` functions the public-token routes call, after the property-access gate. So the Phase 6 server-owned-amount guarantee (ADR-0013 §2) and the change-order contract-value application (ADR-0011) hold identically here — there is no second, divergent copy to keep in sync. The portal is a new *authenticated entrypoint* to existing verbs, not a new implementation of them.

### 7. Customer-facing data goes through the same redaction allowlists

The portal serializes documents with the existing `PublicEstimate` / `PublicChangeOrder` / `PublicInvoice` allowlist types. Internal costs, staff ids, internal notes, and pricebook pointers are structurally absent from those shapes, so they cannot leak through the portal any more than through a public token link. Property summaries the portal returns (`PortalPropertySummary`) deliberately omit gate codes, access notes, and equipment internals — the customer sees their address, not the tech's entry instructions.

## Consequences

- **Two auth systems now coexist.** Staff use NextAuth + middleware (`/dashboard`, `/tech`); customers use the portal session cookie + per-route `requirePortalAuth()`. The NextAuth middleware matcher deliberately excludes `/portal`. A reviewer must not "unify" these — the separation is the security boundary (Decision 1).
- **Portal data must never be cached.** `Cache-Control: no-store` is set for `/portal/*` and `/api/portal/*`; sign-out clears the Cache Storage API. The service worker precaches static JS/CSS only — never portal HTML or API responses.
- **Admin management is gated by a new permission,** `canManagePortalUsers` (platform_owner + tenant_admin only), enforced server-side on every `/api/portal-users/*` route, with a matching nav entry.
- **A dead-simple abuse surface (email → link) is rate-limited:** `portalLinkRequest` 5/hr, `portalAuth` 10/hr, `portalView` 60/min, `portalAction` 20/hr, all Postgres-backed (Phase 1 limiter).

## Alternatives considered

- **Customers as `users` rows with a `customer` role** — rejected (Decision 1): one bug from staff access, and every staff query would have to remember to exclude customers.
- **Passwords for customers** — rejected (Decision 2): breach liability and support cost with no upside for an infrequent-login audience.
- **Stateless JWT sessions** — rejected (Decision 4): revocation would lag until token expiry; deactivating or kicking a customer must take effect on the next request.
- **A portal booking engine** — out of scope by product boundary; links out to GHL (`tenants.portal_booking_url`).
