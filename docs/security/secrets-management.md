# Secrets Management

## Where secrets live

All secrets are environment variables — in Vercel's project environment variables in production, in `.env.local` (gitignored, never committed) locally. No secret is ever hardcoded in source, per `.claude/rules/security-rules.md` (verified true throughout Phase 0's audit and this phase's changes).

| Secret | Used by | Notes |
|---|---|---|
| `NEXTAUTH_SECRET` | NextAuth JWT signing | Base64, generated via `openssl rand -base64 32` |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/db/client.ts` (`db`) | Bypasses RLS — server-only, never imported in a client component |
| `GHL_WEBHOOK_SECRET` | Inbound GHL webhook verification | Distinct from the token below — never place in GHL workflow config |
| `GHL_PRIVATE_INTEGRATION_TOKEN` | Outbound GHL API calls | Never logged (confirmed — only its 8-char prefix was ever logged, by the now-deleted `test-connection` diagnostic route) |
| `CRON_SECRET` | `/api/cron/*` bearer auth | Now fails closed if unset (Phase 1 H3 fix) rather than silently permitting unauthenticated access |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe SDK / webhook verification | Currently empty in all environments — the invoice/Stripe feature is unreachable end-to-end (see `docs/audits/markate-gap-analysis.md`) |
| `RESEND_API_KEY` | Transactional email (invites, password reset, estimate notifications) | |

## Validation

`scripts/validate-env.sh`, wired into `npm run build` via `prebuild` (Phase 1 — previously existed but was invoked by nothing). Fails the build if any of the load-bearing vars (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GHL_WEBHOOK_SECRET`, `GHL_PRIVATE_INTEGRATION_TOKEN`, `GHL_LOCATION_ID`, `CRON_SECRET`) is missing; warns (non-blocking) on Stripe/Resend since those features aren't live yet.

CI (`.github/workflows/ci.yml`) supplies placeholder values for these so the build step can run without real secrets — `next build`'s static generation never makes a live network call in this app (verified empirically: the build has succeeded throughout this phase regardless of whether GHL/Supabase were actually reachable).

## Rotation

No automated rotation exists (expected for a project this size — noted as a gap, not fixed). If a secret is suspected compromised:
1. Rotate it at the source (Supabase dashboard for the service role key, GHL Private Integration settings for the GHL token, Vercel for `NEXTAUTH_SECRET`/`CRON_SECRET` — generate a fresh random value).
2. Update the Vercel environment variable and redeploy.
3. Rotating `NEXTAUTH_SECRET` invalidates every existing session immediately (all JWTs fail signature verification) — this is the correct behavior for a suspected-compromise rotation, but means every user is logged out. Communicate before rotating in a non-emergency.
4. Rotating `SUPABASE_SERVICE_ROLE_KEY` requires no user-facing disruption (the app picks it up on next request).

## What Phase 1 added

- Invitation and password-reset tokens are now hashed (SHA-256) at rest — `src/lib/security/tokens.ts` — rather than stored/compared in plaintext (security-audit M11).
- `password_hash` (bcrypt, cost 12) — unchanged, was already correct.
- Structured logger (`src/lib/security/logger.ts`) redacts a fixed set of sensitive field names (`password`, `token`, `secret`, `email`, `phone`, etc.) before any log line is emitted, closing the specific instances of secret-metadata/PII leakage Phase 0 found (M14, M15) at their call sites.
