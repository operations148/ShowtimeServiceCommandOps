# QA Test Plan — Customer Portal (Phase 7)

Manual + automated coverage for the customer portal. Automated auth-core coverage: `src/lib/portal/authorize.test.ts` (property-access gate), `src/config/roles.test.ts` (Phase 7 permission matrix). Run all: `npx vitest run`.

Prereq: migration `20260715000001` applied to a test DB; at least two properties and two portal customers with **non-overlapping** property grants (call them **Cust-A** and **Cust-B**).

## 1. Invitation & first login (admin → customer)
| # | Step | Expected |
|---|---|---|
| 1.1 | As tenant_admin, open **Portal Users** → Invite; enter email/name, pick ≥1 property | Success toast; customer appears Active with correct property count |
| 1.2 | Invite with **no** property selected | Blocked ("Select at least one property") |
| 1.3 | Invite a property id from **another tenant** (tampered request) | 422, not granted |
| 1.4 | Re-invite the **same email** with a different property set | Idempotent: same customer, property set replaced, reactivated |
| 1.5 | Customer opens invite link within 72 h → lands on portal | Session established, overview loads |
| 1.6 | Office staff / technician tries to open `/dashboard/portal-users` or hit the API | Blocked (no `canManagePortalUsers`) |

## 2. Magic-link auth
| # | Step | Expected |
|---|---|---|
| 2.1 | `/portal/login`, enter a known email | Generic "check your email" — no indication an account exists |
| 2.2 | Enter an **unknown** email | **Identical** response (no enumeration) |
| 2.3 | Click a login link twice | First establishes session; second is inert ("link expired/used") |
| 2.4 | Use a link after 20 min (login) | Rejected as expired |
| 2.5 | Simulate an email scanner GET on `/portal/auth/[token]` (no JS), then the real click | Token survives the GET; the human's POST still works |
| 2.6 | Request 6 links in an hour | 6th rate-limited (`portalLinkRequest` 5/hr) |

## 3. Property-scoped authorization (the core boundary)
| # | Step | Expected |
|---|---|---|
| 3.1 | As **Cust-A**, list estimates/invoices/change-orders/properties | Only Cust-A's properties' documents |
| 3.2 | As Cust-A, GET a **Cust-B** estimate id directly | Generic not-found (no existence oracle) |
| 3.3 | As Cust-A, POST accept on a **Cust-B** change order id | Generic not-found; no state change |
| 3.4 | As Cust-A, POST pay on a **Cust-B** invoice id | Generic not-found; no Checkout session |
| 3.5 | Admin removes a property grant from Cust-A; Cust-A reloads | Those documents disappear immediately |

## 4. Estimate / change-order decisions
| # | Step | Expected |
|---|---|---|
| 4.1 | Open a `sent` estimate, Accept with typed name | Status accepted; typed-name signature recorded; draft invoice created (per Phase 3) |
| 4.2 | Accept button with empty name | Disabled/blocked |
| 4.3 | Decline with optional reason | Status declined; reason recorded |
| 4.4 | Accept an already-accepted estimate | Idempotent / "already responded" |
| 4.5 | Approve a change order | Status accepted; contract value applied to parent WO (ADR-0011) |
| 4.6 | Act on a stale `version` (edited server-side meanwhile) | "reload before responding" (409) |
| 4.7 | Open an expired estimate/CO | No action bar; expired notice |

## 5. Invoice payment
| # | Step | Expected |
|---|---|---|
| 5.1 | Open an invoice with balance due, tenant Stripe-onboarded | Pay buttons visible; deposit button only when a partial deposit is outstanding |
| 5.2 | Click Pay balance | Redirects to Stripe Checkout on the tenant's connected account; amount == server `amount_due` |
| 5.3 | Tamper the POST body to add an `amount` | Ignored — amount is server-owned |
| 5.4 | Complete payment, return with `?status=paid` | Success banner; ledger/amounts update (Phase 6) |
| 5.5 | Open a fully-paid / void invoice | No pay buttons; settled banner |
| 5.6 | Tenant **not** Stripe-onboarded | `can_pay_online=false`; no pay buttons |
| 5.7 | Download invoice PDF | PDF served for the customer's own invoice only |

## 6. Profile & sessions (self-service)
| # | Step | Expected |
|---|---|---|
| 6.1 | Edit name/phone on Profile | Saved; email field read-only |
| 6.2 | Security page lists active sessions | Current device highlighted; IP/last-seen shown |
| 6.3 | Revoke a **non-current** session | It disappears; that device is logged out next request |
| 6.4 | Revoke the **current** session | Redirected to login |

## 7. Admin session/access management
| # | Step | Expected |
|---|---|---|
| 7.1 | Admin "Sign out all devices" | All customer sessions dead at once (`session_version` bump) |
| 7.2 | Admin "Revoke access" | Customer locked out next request; can't request new links; Restore re-enables |
| 7.3 | Admin "Resend sign-in link" | New invite link sent (rate-limited); revoked customer → blocked |
| 7.4 | Each admin action | Writes both `portal_events` and staff `audit_events` |

## 8. Data-exposure spot checks
| # | Step | Expected |
|---|---|---|
| 8.1 | Inspect any portal document JSON response | No `unit_cost`/internal cost, staff ids, internal notes, pricebook pointers |
| 8.2 | Inspect property summary JSON | No gate code, access notes, service notes, equipment internals |
| 8.3 | Response headers on `/portal/*` and `/api/portal/*` | `Cache-Control: no-store...` |
| 8.4 | Sign out, press browser Back | No cached sensitive page (bfcache/no-store); caches cleared |
| 8.5 | View page source / robots | `noindex, nofollow` |

## 9. Branding & boundaries
| # | Step | Expected |
|---|---|---|
| 9.1 | Portal shows tenant logo/name/colors | From `PortalBranding` |
| 9.2 | `portal_booking_url` set | "Book a Visit" links out to GHL |
| 9.3 | `portal_booking_url` unset | No booking link (portal builds no booking engine) |

## 10. Regression gate
- `npx tsc --noEmit` clean · `npx next lint` no new errors · `npx vitest run` all green · `npm run build` succeeds.
