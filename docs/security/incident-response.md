# Incident Response — Baseline Runbook

_Minimal, practical runbook for this project's current scale (single production tenant, small team). Not a formal IR program — a starting point Phase 11 (production readiness) should expand._

## Detection

- **Vercel logs** are the primary signal source today — every route logs via either raw `console.*` (most of the codebase) or the structured `logger` (`src/lib/security/logger.ts`, used in the Phase 1 security-critical paths: auth, rate limiting, webhooks, outbox). No log aggregation/alerting service is wired up (a gap — Phase 11 should evaluate one).
- `GET /api/health` — reports DB reachability. No alerting is attached to it (no uptime monitor configured); it exists for manual/future automated checks.
- `user_activity_log` — the audit trail for identity-affecting actions (see `docs/security/audit-event-catalog.md`). Query it directly via Supabase for "who did what" during an investigation.
- `webhook_events` / `ghl_sync_outbox` tables — check `processing_status`/`status` for stuck or failing rows during a GHL/Stripe integration incident.

## Common scenarios

### Suspected credential compromise (a user's password, or an admin account)
1. Deactivate the account: `PATCH /api/team/[id]` or `/api/technicians/[id]` with `is_active: false` — this bumps `session_version`, invalidating every existing session for that user immediately (Phase 1 fix — previously this had no immediate effect).
2. Force a password reset before reactivating.
3. Check `user_activity_log` for that `user_id` to see what they did while potentially compromised.

### Suspected secret compromise (`GHL_WEBHOOK_SECRET`, `GHL_PRIVATE_INTEGRATION_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXTAUTH_SECRET`)
See `docs/security/secrets-management.md`'s rotation section. Rotating `NEXTAUTH_SECRET` logs out every user — communicate first unless it's an active-exploitation emergency.

### Webhook flooding / abuse (GHL or Stripe endpoint)
- Both webhook routes verify signatures before any processing — an attacker without the real secret cannot get past `constructEvent`/`verifyRequest`. Confirm the `webhook_events` table isn't accumulating rows with `verification_status` indicating repeated failures from a single source before assuming this is a real incident rather than a misconfigured legitimate sender (e.g., GHL retrying after a timeout).
- If genuinely under abuse from a source with a *valid* secret (i.e., the secret itself is compromised), rotate it (see above) — this immediately invalidates the attacker's ability to sign new requests.

### GHL outbound sync stuck (work orders not syncing back to GHL)
1. Check `ghl_sync_outbox` for rows in `status = 'dead_letter'` (exhausted `MAX_ATTEMPTS = 8`) or stuck in `processing` (a drain cron invocation that crashed mid-run).
2. `GET /api/cron/drain-ghl-outbox` can be invoked manually (with the `CRON_SECRET` bearer header) to force an immediate drain attempt outside the 15-minute schedule.
3. Dead-lettered rows currently require direct DB inspection/manual resolution — no admin UI exists yet (noted as a Phase 4/10 follow-up in ADR-0004).

### Suspected cross-tenant data exposure
1. This would be the highest-severity possible incident for this app. Phase 0's audit found no unconditional cross-tenant exposure path; if one is discovered, treat it as Critical regardless of what this document says and escalate immediately.
2. Immediately check: does the offending route call `getTenantId(session)` and thread it into every query? Is `requireApiAuth()` (with its trusted-context revalidation) actually being called, or was a route added that bypasses it?
3. Preserve the request that triggered the discovery (log line, `request_id`) for post-incident analysis before doing anything else.

## What doesn't exist yet (Phase 11 should build)

- No on-call rotation, paging, or SLA — this is a small-team project, addressed informally today.
- No log aggregation/alerting service (Vercel logs only, no retention/search beyond Vercel's own dashboard).
- No automated anomaly detection (e.g., alerting on a spike in failed logins, which the rate limiter now makes visible in principle but nothing currently watches for it).
- No documented communication plan for a customer-facing incident (not needed yet — no customer-facing surface exists per the Phase 0 gap analysis; becomes necessary once Phase 7's customer portal ships).
