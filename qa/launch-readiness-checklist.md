# Launch Readiness Checklist
_Last updated: 2026-07-18 — Phase 11 full reconciliation. The previous version (2026-05-14) predated the entire Markate expansion (Phases 1–10) and referenced retired infrastructure (dead URL, in-memory retry queue); every line below reflects verified current reality. Evidence and analysis live in `docs/launch-readiness-report.md`._

Legend: `[x]` verified · `[c]` config action (no code) · `[m]` manual/human verification required

## Code quality (verified 2026-07-18)
- [x] TypeScript strict — `tsc --noEmit` clean
- [x] Lint — 0 errors
- [x] Automated tests — 413 passing (39 files: money, state machines, costing, redaction, permissions, offline, financial reporting, tokens, webhooks)
- [x] Production build — `next build` exit 0
- [x] CI pipeline on client repo — lint/typecheck/tests/migration-check/build/audit/secret-scan (`.github/workflows/ci.yml`)
- [x] CI secret-scan step fixed (was false-failing every master push — inverted empty-diff logic; now scans all tracked files)
- [ ] CI green on client repo after next push (expected — the fix ships with Phase 11; verify in the Actions tab)

## Security (verified against production 2026-07-18)
- [x] Security headers live: CSP, HSTS (preload), X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [x] RLS enabled on **every** public table (zero disabled — advisor clean after the `20260717000002` backfill)
- [x] Anon-key PostgREST access denied on internal tables (verified live: 42501/401; `rate_limits` was leaking before the fix)
- [x] All 3 cron endpoints fail closed without secret (401) — `CRON_SECRET` confirmed set by behavior
- [x] GHL webhook rejects unsigned POSTs (401 — signature verification active, secret configured)
- [x] Login rate limiting live (verified: wrong-password → 401, limiter row written)
- [x] Sessions revocable (staff `session_version` + portal DB-backed sessions re-validated per request)
- [x] All tokens hashed at rest (invitations, password reset, public documents, portal magic links/sessions)
- [x] Tenant isolation at the API layer on every route; technicians scoped to own jobs; portal property-scoped
- [x] Cost/margin redaction server-side (technicians structurally cost-blind — Phase 9 serializer)
- [x] Audit log covering auth, permissions, payments, portal admin, rate changes, platform actions
- [x] No secrets committed (value-pattern scan of all tracked files clean; only `.env.example` tracked)
- [x] Dependency audit run + analyzed — 9 findings remain, **none in the attacker-reachable auth path** (see report §3: Next 15.5.20 has the middleware-bypass CVE patched; residuals are the 16.x-fixed DoS/cache class + build-time tooling). Upgrades scheduled, not launch-blocking.
- [ ] MFA — not implemented (documented residual since Phase 1; revisit post-launch)

## Payments (Phase 6 — deployed, dormant)
- [x] Invoice lifecycle, immutable ledger, Stripe Connect code, webhook verification, reconciliation cron — all deployed
- [c] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` set in Vercel (test keys first) — **payments stay off until set**
- [c] Stripe webhook endpoint created (checkout.session.completed, charge.refunded, account.updated + Connect events)
- [m] One end-to-end test payment in Stripe test mode (checkout → webhook → ledger → invoice paid)
- [m] Tenant Stripe Connect onboarding completed by the client

## Customer portal (Phase 7 — live)
- [x] Portal deployed; no-store cache policy verified live; sessions revocable; property-scoped
- [c] Customer email delivery is **preview-gated** — approve live sends before inviting real customers
- [m] Invite one pilot customer; walk the accept/decline/pay flow with them

## Technician PWA & offline (Phase 8 — live)
- [x] Offline read cache + drafts + outbox deployed (kill-switch on by default)
- [m] Real-phone pass per `qa/technician-offline-test-plan.md` (airplane-mode job view, offline complete → reconnect sync, photo retry) — **cannot be verified from a terminal**
- [m] Tap targets / layout on a real iPhone and Android

## Job costing (Phase 9 — live)
- [x] Time/mileage/expense capture + derived rollup + cost-blind technicians deployed
- [c] Set tenant mileage + labor-fallback rates, and each technician's hourly cost (Technicians → edit) — **until then every job costs $0 and margin reads 100%**

## Financial reporting & platform admin (Phase 10 — live)
- [x] Financial report live + owner-gated (verified: authed owner receives a real report; unauthenticated → 401)
- [x] Platform admin dormant (`NEXT_PUBLIC_PLATFORM_ADMIN_ENABLED` unset → 404) — leave off until a second tenant exists

## GHL integration
- [x] Webhook signature verification + always-200-to-GHL handling + durable outbox retry (Phase 1; the in-memory queue is long gone)
- [x] Reporting confirmed running in LIVE mode (not mock data)
- [c] Confirm `GHL_PRIVATE_INTEGRATION_TOKEN` / location mapping current in Vercel (values unreadable via CLI; webhook behavior implies configured)
- [m] Webhook configured in GHL Settings → URL `https://serviceops-ghl-workorders-chi.vercel.app/api/ghl/webhooks` + events + secret
- [m] End-to-end with a real GHL payload: opportunity → work order created
- [m] Estimate handoff + completion sync verified against the live GHL location
- [m] Pipeline stage names confirmed with the client against `GHL_JOB_READY_STAGES`

## Data
- [x] Production DB current through migration `20260717000003` (32/32 applied, none pending)
- [x] Real tenant (Showtime Pool Service) with real properties/technicians — no demo seed rows
- [m] Client's full property list imported or entered
- [m] Real technician accounts created (real emails); confirm the admin account email is the client's

## Infrastructure
- [x] Production URL: `https://serviceops-ghl-workorders-chi.vercel.app` (the old `serviceops-ghl-workorders.vercel.app` is a different account's stale deployment — do not use)
- [x] Crons registered (Vercel Hobby = daily max: generate-visits, drain-ghl-outbox, reconcile-payments)
- [x] Deploys via `vercel --prod` (do not rely on push-to-deploy)
- [ ] Consider Vercel Pro if crons need to run more than daily (reconciliation/outbox currently 1×/day)

## Client sign-off
- [m] Demo walkthrough completed (dashboard → job → invoice → portal)
- [m] Client reviewed the technician flow on a real phone
- [m] Client approved: live Stripe keys, live portal email, GHL stage names
- [m] Client has the EOD reports for Phases 0–10
