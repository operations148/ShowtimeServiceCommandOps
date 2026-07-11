# Threat Model — Post-Phase 1

_Lightweight STRIDE-style pass over ServiceOps Command Center's actual attack surface, reflecting the Phase 1 security foundation. Cross-references `docs/audits/security-audit.md` (Phase 0 findings) throughout._

## Assets

- Customer PII: names, addresses, phone numbers, gate codes, access notes (properties table).
- Credentials: `password_hash` (bcrypt), invitation/reset tokens (now hashed — see below).
- Financial data: invoice amounts, Stripe payment intents/checkout sessions (currently unreachable end-to-end per `docs/audits/markate-gap-analysis.md`, but the data model and webhook exist).
- GHL integration secrets: `GHL_PRIVATE_INTEGRATION_TOKEN`, `GHL_WEBHOOK_SECRET`.
- Tenant isolation itself: the guarantee that Tenant A's data is never visible to Tenant B.

## Actors

| Actor | Trust level | Primary interface |
|---|---|---|
| Tenant Admin / Office Staff | Authenticated, tenant-scoped, high privilege | `/dashboard/*` |
| Technician | Authenticated, tenant-scoped, own-jobs-only | `/tech/*` |
| Read-Only Owner | Authenticated, tenant-scoped, no mutation | `/dashboard/*` (read paths) |
| GHL (external service) | Unauthenticated by session, authenticated by webhook secret | `POST /api/ghl/webhooks` |
| Stripe (external service) | Unauthenticated by session, authenticated by webhook signature | `POST /api/stripe/webhook` |
| Anonymous internet | Untrusted | `/login`, `/forgot-password`, `/reset-password/[token]`, `/accept-invite/[token]` |
| Vercel Cron | Authenticated by `CRON_SECRET` | `/api/cron/*` |

## STRIDE pass

**Spoofing**
- Login: mitigated by bcrypt + durable rate limiting (Phase 1, closes H1). Session cookie: `httpOnly`, `SameSite=Lax`, `secure` in production (now explicit, Phase 1).
- Webhook spoofing: GHL — Bearer/HMAC verified with constant-time comparison (Phase 1 closed L1); query-token mode disabled in production. Stripe — signature verification unchanged (was already correct).
- Cron spoofing: constant-time `CRON_SECRET` comparison, fails closed if unset (Phase 1 closed H3).

**Tampering**
- Cross-tenant tampering: `getTenantId(session)` + tenant-scoped queries on every route (verified per-route in Phase 0's audit); trusted-context resolution (Phase 1) ensures the tenant ID used is fresh from the DB, not a stale/tampered JWT claim.
- File upload tampering: magic-byte sniffing + re-encoding now validates actual content rather than a spoofable `Content-Type` header (Phase 1 closed M4).
- Webhook payload tampering: signature verification (both providers) precedes any parsing.

**Repudiation**
- `user_activity_log` (extended in Phase 1 with `metadata`/`request_id`/`source`) now has real call sites for invitation/password/role-change events — previously one call site (estimate-lock override) existed. Financial and estimate-decision audit coverage remains a Phase 2/3/6 item (those modules don't fully exist yet).

**Information Disclosure**
- PII in logs: targeted sweep of the highest-value spots (auth failures, GHL sync) replaced raw email/customer-name logging with masked/ID-only equivalents (Phase 1 closed the specific M15 instances found in Phase 0; a codebase-wide logger migration remains future work — see `docs/audits/security-audit.md` systemic gaps).
- Secret leakage: GHL webhook mismatch reason no longer includes secret length/first-char-match (Phase 1 closed M14).
- Cross-tenant IDOR: the visit-photo deletion path (M7) and the visits-creation ownership gap (M8) were both closed in Phase 1.

**Denial of Service**
- Login, password reset, invitation acceptance, and the `send-estimate` email-sending route are now rate-limited (Phase 1 closed H1 and the systemic "no rate limiting" gap for these specific surfaces — reports/exports/other admin actions have a shared `adminAction` policy available but are not yet individually wired to it, a scope decision to avoid touching every route in one pass).
- Cron endpoints fail closed rather than open when misconfigured (H3).

**Elevation of Privilege**
- The `send-estimate` route's missing permission check (H4) — any authenticated role could email an arbitrary address a work order's gate code — was the clearest EoP-adjacent finding in Phase 0 and is fixed in Phase 1.
- RLS's `work_orders_update` policy incorrectly granting `read_only_owner` UPDATE was fixed at the database level even though RLS is not currently the enforcement path for application traffic (defense-in-depth correctness).

## Residual risk after Phase 1 (carried forward, not closed by this phase)

- RLS remains unreachable for the service-role path — tenant isolation has exactly one enforcement layer (`getTenantId` + trusted context), with no independent DB-level backstop if a future route forgets it. Documented, not fixed (would require a larger architecture change).
- No MFA — explicitly allowed to remain a documented production blocker per the phase-prompt, given the current auth stack (NextAuth Credentials provider) has no first-party MFA support without significant additional work.
- Public customer-facing surfaces (estimate/invoice token pages, customer portal) don't exist yet — their token-security requirements (hashed, expiring, rate-limited, cross-tenant-denial-tested) are designed into this phase's `password_reset_tokens`/`user_invitations` pattern for reuse, but the actual public routes are Phase 3/6/7 work.
- Full codebase-wide structured-logging migration (replacing all remaining raw `console.*` calls) is not done — only the specific PII-bearing call sites Phase 0 flagged were fixed.
