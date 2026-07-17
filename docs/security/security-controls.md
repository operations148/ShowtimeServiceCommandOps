# Security Controls Inventory — Post-Phase 1

_Maps each Phase 0 finding to the exact control now in place, with file references. This is the "what's actually implemented" companion to `docs/audits/security-audit.md` (the findings) and `docs/architecture/threat-model.md` (the risk framing)._

| Finding | Control | Location |
|---|---|---|
| H1 — no login rate limiting | Durable Postgres-backed rate limiter, 10 attempts/15min per email | `src/lib/security/rate-limit.ts`, `rate_limit_hit()` in migration `20260711000001`, wired in `src/lib/auth/config.ts` |
| H2 — no session revocation | `session_version` column + trusted-context re-validation on every request | `src/lib/auth/trusted-context.ts`, `src/lib/auth/api-auth.ts`, `src/lib/auth/index.ts` |
| H3 — cron fails open | Fails closed (503) when `CRON_SECRET` unset; constant-time comparison | `src/app/api/cron/generate-visits/route.ts`, `src/app/api/cron/drain-ghl-outbox/route.ts` |
| H4 — send-estimate under-permissioned | `requirePermission("canSendEstimateEmail")` + rate limit | `src/app/api/work-orders/[id]/send-estimate/route.ts` |
| M1 — RLS inert | Documented as accepted residual risk (see threat-model.md); one incorrect policy fixed | migration `20260711000001` (`work_orders_update` policy) |
| M2 — optional tenantId on deletes | `tenantId` now required (compile-time enforced) | `deleteWorkOrder`/`deleteRecurringSchedule` in `src/lib/db/queries/*.ts` |
| M3 — hard delete / soft-delete inconsistency | `deleteRecurringSchedule` now sets `is_active = false` | `src/lib/db/queries/recurring-schedules.ts` |
| M4 — no magic-byte validation | `validateAndReencodeImage()` sniffs real content via `file-type` | `src/lib/security/file-validation.ts` |
| M5 — SVG accepted into public bucket | SVG removed from company-logo allowlist | `src/app/api/settings/company/logo/route.ts` |
| M6 — no EXIF/GPS stripping | Sharp re-encode strips all metadata by default | `src/lib/security/file-validation.ts` |
| M7 — cross-visit photo IDOR | Path must be a member of *this* visit's `photo_urls` | `src/app/api/visits/[id]/photos/route.ts` |
| M8 — visits POST missing ownership checks | Verifies work_order/property tenant match; forces technician_id for technician callers | `src/app/api/visits/route.ts` |
| M9 — no security headers | CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS (prod) | `next.config.ts` |
| M10 — no CSRF/origin layer | `isSameOriginRequest()` called from `requireApiAuth()`; explicit cookie flags | `src/lib/security/origin.ts`, `src/lib/auth/config.ts` |
| M11 — plaintext invitation token | SHA-256 hash stored, never plaintext | `src/lib/security/tokens.ts`, `src/app/api/invitations/accept/route.ts` |
| M12 — invitation TOCTOU race | Atomic conditional UPDATE claim | `src/app/api/invitations/accept/route.ts` |
| M13 — invoices.public_token unauditable | Unchanged this phase — invoices/Stripe are unreachable end-to-end per gap analysis, deferred to Phase 2/6 | — |
| M14 — GHL webhook secret-metadata leak | Mismatch reason no longer includes length/char-match | `src/app/api/ghl/webhooks/route.ts` |
| M15 — PII in logs | Targeted fix: auth failures masked, GHL sync logs by ID not name | `src/lib/security/logger.ts`, `src/lib/auth/config.ts`, `src/lib/ghl/upsert-property-from-ghl.ts`, `src/lib/ghl/work-order-factory.ts` |
| M16 — validate-env.sh not wired | Wired as `prebuild`; variable list corrected; `.env.local` parsing verified correct (including trailing `=` in base64 secrets) | `scripts/validate-env.sh`, `package.json` |
| M17 — duplicate InvoiceStatus types | Unchanged this phase — reconciliation is Phase 2 scope (schema/type work), not a security control | — |
| M18 — tenant-scoped email ambiguity | Explicit ADR; documented operational constraint | `docs/architecture/decisions/ADR-0002-identity-and-memberships.md` |
| L1 — non-constant-time comparisons | Constant-time compare for GHL bearer/query-token and cron secret | `src/app/api/ghl/webhooks/route.ts`, `src/app/api/cron/generate-visits/route.ts` |
| L2 — unauthenticated diagnostic route | Deleted | (was `src/app/api/ghl/test-connection/route.ts`) |
| L4 — no self-service password reset | Full request/confirm flow added | `src/app/api/auth/password-reset/*`, `src/app/forgot-password/`, `src/app/reset-password/[token]/` |
| L6 — dead `waitUntil` check | Replaced with real `after()` from `next/server` | `src/app/api/work-orders/[id]/route.ts` |
| L7 — in-memory GHL retry queue | Durable Postgres outbox + drain cron | `src/lib/ghl/sync-outbox.ts`, ADR-0004 |
| Systemic — no rate limiting | Durable limiter applied to login, password reset, invitation accept, send-estimate | `src/lib/security/rate-limit.ts` (named policies for other surfaces available, not all wired yet) |
| Systemic — no CI | Full pipeline: lockfile-enforced install, lint, typecheck, test, migration check, build, audit, secret scan | `.github/workflows/ci.yml` |
| Systemic — no test framework | Vitest added; 22 tests covering the new security-critical modules | `vitest.config.ts`, `src/**/*.test.ts` |
| Systemic — untracked DB tables | Not resolved this phase (requires a live schema dump) — flagged for Phase 2 | `docs/architecture/erd.md` |

## Explicitly not addressed in Phase 1 (see threat-model.md "Residual risk")

- Full RLS reachability (would require moving off the service-role client or per-request session variables).
- MFA (documented production blocker, per phase-prompt allowance).
- `invoices`/`user_invitations`/`invoice_line_items` untracked-migration reconciliation (Phase 2).
- Full permission-model retrofit across all 35 routes (ADR-0003 explains why).

## Addendum — RLS backfill hardening (2026-07-17, post-Phase 9)

Supabase's database advisor flagged 5 tables with RLS **disabled**, reachable by the
anon/authenticated PostgREST roles. Verified live before fixing: **the public anon key
could read `rate_limits` rows** (login-attempt keys carrying user emails) and could
equally have deleted them, resetting login brute-force protection. This was the M1/H1
debt combining: tables added across Phases 1–6 that missed the RLS loop newer
migrations apply. The app itself was never affected (all queries go through the
service-role client, which has BYPASSRLS) — the exposure was the direct PostgREST path
around the app.

| Table | Fix (migration `20260717000002`) |
|---|---|
| `invoice_line_items`, `recurring_schedules`, `work_order_status_history` | RLS enabled + the standard tenant-scoped select/write policies (same pattern as `20260714000001`) |
| `rate_limits`, `webhook_events` | Internal-only (no `tenant_id`, no legitimate non-service reader): RLS enabled with **no policies** (default-deny) + `REVOKE ALL FROM anon, authenticated` |

Verified after applying: anon-key PostgREST reads of all 5 tables are denied; login
(rate-limiter write path) and app pages unaffected.
