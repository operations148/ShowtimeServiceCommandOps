# Spec — Customer Portal (Phase 7)

**Status:** Code-complete (branch `feat/serviceops-phase-7-customer-portal`, not merged/deployed)
**Related:** ADR-0014 (auth), ADR-0007 (public tokens), ADR-0011 (change orders), ADR-0013 (Stripe amounts), `database-blueprint/customer-portal.md`, `docs/security/portal-security.md`, `qa/customer-portal-test-plan.md`

## 1. Purpose

A secure, tenant-branded, mobile-first web portal where a service business's **customers** sign in to review and act on the documents ServiceOps already owns for them: estimates (accept/decline), change orders (approve/reject), invoices (view + pay by card), and completed-work history. It is a read-and-approve surface, not a CRM, booking engine, or messaging tool — those stay in GHL (`product-boundaries.md`).

## 2. Who uses it

| Actor | How they get in | What they can do |
|---|---|---|
| **Portal customer** | Admin invites them (email) → passwordless magic link | See only their granted properties' documents; accept/decline estimates & change orders; pay invoices; edit own name/phone; manage their own sessions |
| **Tenant admin / platform owner** | Existing staff login; new "Portal Users" nav | Invite customers, grant/revoke property access, resend links, sign a customer out everywhere, revoke access |

Office staff and technicians have **no** portal-management access (`canManagePortalUsers` is false for them).

## 3. Authentication & session (see ADR-0014 for rationale)

1. Customer visits `/portal/login`, enters email.
2. Server issues a one-time, hashed, 20-min magic link per active matching account (across tenants), emailed via the safe mailer (preview-mode default like all customer email). Response never reveals whether/how many accounts matched.
3. Customer clicks the link → `/portal/auth/[token]` → **client-side POST** exchanges the token for a session (so email scanners can't burn it).
4. Session is a DB-backed, revocable row; an httpOnly cookie carries an opaque token (hash stored). Every request re-validates: not revoked, not expired, customer active, `session_version` matches.
5. Sign-out clears the cookie + the Cache Storage API.

Invite links use the same mechanism with a 72-hour TTL and `purpose = 'invite'`.

## 4. Customer-facing surface (`/portal/*`)

All pages live under a session-guarded shell (`PortalShell`) that renders the tenant's logo/name/colors (`PortalBranding`) and, when configured, a "Book a Visit" link out to the tenant's GHL booking URL.

| Route | Content |
|---|---|
| `/portal/overview` | Greeting, counts (properties, open estimates, unpaid invoices), balance due, recent activity |
| `/portal/properties` | The customer's granted properties (address + customer name only — no gate codes/access notes) |
| `/portal/estimates` + `/estimates/[id]` | List + full estimate; **accept** (typed-name signature) / **decline** (optional reason) via a fixed action bar |
| `/portal/change-orders` + `/change-orders/[id]` | List + full change order; **approve** / **reject**, same pattern |
| `/portal/invoices` + `/invoices/[id]` | List + full invoice with line items, payment history, **Pay deposit / Pay balance** (Stripe Checkout), PDF download |
| `/portal/work-history` | Completed visits/work for the customer's properties |
| `/portal/profile` | Edit own name/phone (email is the identity, read-only) |
| `/portal/security` | List own active sessions (device/IP/last-seen), revoke any, "this device" highlighted |

Every list and detail read is scoped to the customer's granted property ids; every action re-checks `assertPropertyAccess` before running domain logic.

## 5. Accept / decline / pay reuse existing verbs

The portal does **not** reimplement business logic. After the property-access gate it calls the same functions as the public-token routes:

- Estimate accept/decline → `acceptEstimate` / `declineEstimate` (standard + pre-selected lines; portal has no per-line option UI).
- Change order approve/reject → `acceptChangeOrder` / `rejectChangeOrder` (contract-value application on accept, per ADR-0011).
- Invoice payment → `createInvoiceCheckoutSession` (server owns amount/currency/tenant; body carries only `deposit` | `balance`, per ADR-0013).

Optimistic-concurrency `version` is passed through and a stale version returns "reload before responding".

## 6. Admin surface (`/dashboard/portal-users`)

- **List** portal customers: name, email, property count, active/revoked status, last sign-in.
- **Invite**: email + name + phone + at-least-one property (verified to belong to the tenant); sends an invite link. Idempotent on `(tenant_id, email)` — re-inviting re-grants and reactivates.
- **Detail slide-over**: edit property grants (save-on-change), resend sign-in link, sign out all devices, revoke access / restore access; shows active sessions and recent portal activity.

All routes require `canManagePortalUsers` and write both a `portal_events` row and a staff `audit_events` row.

## 7. Data exposure rules

- Documents serialize through the existing `PublicEstimate` / `PublicChangeOrder` / `PublicInvoice` allowlist types — internal costs, staff ids, internal notes, pricebook pointers are structurally absent.
- Property summaries omit gate codes, access notes, service notes, and equipment internals.
- No account-enumeration oracle at login; no existence oracle on document ids (mismatched property → generic not-found).

## 8. Non-goals (explicitly out of scope)

- No booking/scheduling engine (links to GHL).
- No messaging/chat (GHL owns conversations).
- No customer self-registration (invite-only).
- No customer passwords.
- No per-line estimate option selection in the portal (accepts as presented).

## 9. Rate limits

`portalLinkRequest` 5/hr · `portalAuth` 10/hr · `portalView` 60/min · `portalAction` 20/hr — all Postgres-backed (Phase 1 limiter), keyed by customer or requester.

## 10. Deploy checklist

1. Merge branch → `master`.
2. Apply migration `20260715000001_phase7_customer_portal.sql`.
3. No new secret required — the session cookie carries an opaque 256-bit bearer token whose SHA-256 hash is stored server-side (reuses `generatePublicToken`/`hashPublicToken`). `APP_URL` must be correct so magic-link URLs resolve.
4. Optionally set each tenant's `portal_booking_url`.
5. Customer email obeys the same preview/live gate as estimates — leave in preview until the client approves live sends.
