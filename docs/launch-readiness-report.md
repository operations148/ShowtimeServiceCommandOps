# Launch Readiness Report — Phase 11
_Date: 2026-07-18 · Scope: full production-readiness pass over Phases 0–10 · Written for both the client and future engineers. Checklist form: `qa/launch-readiness-checklist.md`._

## 1. Executive summary

**The platform is technically launch-ready.** Every automated quality and security check passes, the production deployment was verified live check-by-check (not assumed from code), and one real defect found during this pass — a broken CI step that falsely failed every push — was fixed. What separates today from "launched" is **not engineering work**: it is a short list of configuration switches (Stripe keys, live portal email, GHL webhook registration) and hands-on verification that only a human with a phone and the client's accounts can do.

| Area | Verdict |
|---|---|
| Code quality gates | ✅ All green (413 tests / 39 files, lint 0, strict TS clean, build passes) |
| Security posture | ✅ Verified live in production; no committed secrets; RLS complete |
| CI pipeline | ✅ Fixed this phase (was red on every push — false positive) |
| Dependency health | ⚠️ 9 findings, none launch-blocking (analysis in §3, upgrades scheduled) |
| Payments | ⏸ Deployed but dormant — awaiting Stripe keys (client decision) |
| Portal go-live | ⏸ Live but email is preview-gated — awaiting client approval |
| GHL end-to-end | ⏸ Webhook secured + live; needs registration in GHL + a real payload test |
| Field/mobile QA | 🖐 Requires a real phone (offline sync, tap targets) |

## 2. What was verified, with evidence

### 2.1 Automated gates (run 2026-07-18)
- `tsc --noEmit` — clean. `next lint` — 0 errors. `next build` — exit 0.
- **413 tests across 39 files** — money math, invoice/estimate/work-order state machines, job-costing math and cost-redaction, permission matrices for all 5 roles, offline outbox/drafts, financial-report aggregation, token hashing, webhook verification.

### 2.2 Production, verified live (not from code)
- **Security headers** on real responses: CSP, HSTS (preload), X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **Portal privacy**: `Cache-Control: no-store…` served on portal routes.
- **Cron endpoints fail closed**: all three return 401 without the secret — proving `CRON_SECRET` is set and enforced.
- **GHL webhook** rejects unsigned POSTs (401) — signature verification live, secret configured.
- **Login rate limiter** works end-to-end: a wrong-password attempt returns a graceful 401 and writes a limiter row.
- **Database**: every public table now has RLS enabled (the Supabase advisor that flagged 5 exposed tables mid-Phase-9 is silent); direct anon-key reads of internal tables are denied — re-verified this phase. Migrations: 32/32 applied, none pending.
- **Financial report** returns a correct, complete document to an authenticated owner (and 401 otherwise); **platform admin** correctly does not exist (404) while its kill-switch is off.
- **No secrets in the repo**: a value-pattern scan of every tracked file (AWS keys, private-key blocks, Stripe live keys, Supabase secrets, webhook secrets) found nothing; only `.env.example` is tracked.

### 2.3 CI — the one real defect this pass found and fixed
The client repo's CI had **never gone green on a master push**. Root cause: the secret-scan step diffed `origin/master...HEAD`, which is *empty* on a push to master, and its shell logic treated "nothing scanned" as "secret found" — an inverted condition. Every other step (lint, typecheck, tests, migration check, build, dependency audit) was already passing in CI. Fix: the scan now checks **all tracked files** (strictly more protective, immune to event-type/shallow-checkout quirks) with correct match logic, and its pattern set was extended (Supabase/webhook secret shapes). Verified locally against the full repo: passes. CI is expected green on the next push — confirm once in the GitHub Actions tab.

## 3. Dependency audit — honest analysis, not a green sticker

`npm audit`: 10 findings at start; **1 eliminated this phase** (removing `@types/next-pwa`, an unused types-only package that dragged in a phantom, vulnerable `next@13` never executed at runtime). The remaining **9** were analyzed individually for *actual* exposure:

| Finding | Reality | Risk to this app | Action |
|---|---|---|---|
| `next` 15.5.20 advisories | **The scary one — the middleware auth-bypass CVE (GHSA-7gfc-8cq8-jh5f) — is patched in ≥15.2.3; we run 15.5.20 and are NOT affected.** Residual advisories are the newer DoS / cache-poisoning class fixed only in Next 16. Defense-in-depth also holds: middleware is not the only auth layer — every API route independently re-validates the session against the DB. | Low–moderate (DoS-class, behind Vercel's CDN) | **Scheduled**: Next 16 major upgrade as its own change with full regression, not mid-launch |
| `next-auth` 4.24.14 (via `uuid`) | Moderate randomness advisory in a transitive uuid. This app uses the credentials provider + JWT; portal/document tokens use our own `crypto.randomBytes` (256-bit) — not uuid. npm's "fix" is a downgrade to v3 (nonsense). | Low | **Scheduled**: Auth.js v5 migration post-launch |
| `next-pwa` chain (workbox-build, serialize-javascript, rollup-plugin-terser) | **Build-time only** — these run on a build machine to generate the service worker from our own build artifacts; they never execute in production and process no untrusted input. npm's "fix" is next-pwa 2.0.2 (2020 — would destroy Phase 8). | Very low (supply-chain only) | **Scheduled**: swap to the maintained `@ducanh2912/next-pwa` fork |
| `postcss` (nested under next) | Build-time, resolves with the Next 16 upgrade | Very low | Rides the Next upgrade |

**Accepted-risk register** (revisit post-launch): the three scheduled upgrades above, plus **no MFA** (documented since Phase 1's threat model; magic-link portal auth is possession-based, staff auth is password+rate-limit+revocable sessions).

## 4. The launch gate — what's actually left

**Config switches (minutes each, client decisions — no code):**
1. Stripe test keys + webhook endpoint → turns payments on.
2. Portal email preview → live → real customers can receive magic links.
3. Job-costing rates (tenant defaults + per-technician hourly) → margins become real instead of $0-cost/100%.
4. GHL webhook registered in the GHL dashboard (URL + events + secret).

**Human verification (cannot be done from a terminal):**
1. Technician flow on a **real phone**, including the offline pass (airplane mode → complete job → reconnect → verify sync) per `qa/technician-offline-test-plan.md`.
2. One **Stripe test-mode payment** end-to-end once keys are set.
3. One **real GHL payload** end-to-end (opportunity → work order; completion → sync back).
4. Pilot portal customer walkthrough.
5. Client demo + sign-off (checklist bottom section).

## 5. Recommendation

Ship the Phase 11 fixes (CI repair, dependency cleanup, this documentation), then run the launch gate above in order: rates → Stripe test keys → GHL webhook → phone QA → pilot customer → live email. Nothing in the codebase is blocking launch; the remaining risk lives in configuration and real-world verification, which is exactly where it should be at this stage.
