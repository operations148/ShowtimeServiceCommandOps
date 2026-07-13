# Security Test Plan — Phase 1

_Maps `qa/test-matrix.md`'s Phase-1 rows to concrete manual verification steps, for the cases not yet covered by an automated test (see "Automated" column). Run this before Phase 1 is considered closed._

| # | Test | Automated? | Manual verification steps |
|---|---|---|---|
| 1 | Login rate limiting | No | Attempt login with wrong password 11 times within 15 minutes for the same email. The 11th attempt should be rejected before even checking the password (rate-limited), not just fail on credentials. |
| 2 | Session revocation on deactivation | No | Log in as a test user in one browser. In another session (as admin), deactivate that user. Confirm the first browser's next API call returns 401, not stale success. |
| 3 | Session revocation on role change | No | Log in as OFFICE_STAFF. As admin, change their role to TECHNICIAN. Confirm their next request is rejected (session invalidated) rather than silently continuing with stale OFFICE_STAFF-level access. |
| 4 | Session revocation on password change | No | Log in as a user in two browsers. Complete a password reset for that user in one. Confirm the other browser's session is invalidated on its next request. |
| 5 | Cron fails closed | No | Temporarily unset `CRON_SECRET` in a preview/staging deployment. Confirm `GET /api/cron/generate-visits` and `/api/cron/drain-ghl-outbox` return 503, not 200. **Do not test this against production.** |
| 6 | GHL webhook signature rejection | No | POST to `/api/ghl/webhooks` with a wrong Bearer token. Confirm 401 and that the response body contains no length/char-match detail about the real secret. |
| 7 | GHL webhook duplicate delivery | No | Replay the exact same webhook payload twice (same bytes). Confirm the second delivery returns `{ duplicate: true }` and does not re-run the dispatch logic (check no duplicate work order/property is created). |
| 8 | Stripe webhook duplicate event | No | Use `stripe trigger checkout.session.completed` then replay the same event ID via `stripe events resend`. Confirm the second delivery is a no-op (invoice status unchanged, no duplicate `markDepositPaid` side effect). |
| 9 | Cross-visit photo IDOR closed | No | As a technician with access to Visit A, attempt `DELETE /api/visits/A/photos` with a `path` that belongs to Visit B (same tenant). Confirm 403. |
| 10 | Visits POST cross-tenant denial | No | As an authenticated user in Tenant A, POST to `/api/visits` with a `work_order_id` belonging to Tenant B. Confirm 422, not success. |
| 11 | send-estimate permission gate | No | As a TECHNICIAN, attempt `POST /api/work-orders/[id]/send-estimate`. Confirm 403 (was previously allowed). |
| 12 | Invitation token hashing | Partial (unit-tested via `tokens.test.ts`) | Query `user_invitations.token_hash` directly in Supabase after creating an invite — confirm it's a 64-char hex string, not the plaintext token from the email link. |
| 13 | Invitation replay (TOCTOU) | No | Attempt to accept the same invitation token twice in rapid succession (e.g., two near-simultaneous curl requests). Confirm exactly one succeeds and the other gets "already used." |
| 14 | Password reset generic response | No | Request a password reset for a known email and an unknown email. Confirm both return the identical generic message with no timing/content difference an attacker could use to enumerate accounts. |
| 15 | File upload magic-byte rejection | Automated (`file-validation.test.ts`) | Additionally: manually rename a `.txt` file to `photo.jpg` and attempt to upload it via the technician mobile photo flow. Confirm rejection. |
| 16 | EXIF/GPS stripped from uploads | No | Upload a phone photo with location services on (has GPS EXIF). Download the stored file from Supabase Storage and confirm no EXIF/GPS metadata is present. |
| 17 | Security headers present | No | `curl -I` any page in a deployed preview. Confirm `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` are all present, and `Strict-Transport-Security` is present in production only. |
| 18 | CSP doesn't break the app | No | **Not yet done — flagged explicitly.** Load the app in a real browser against a deployed preview with the new CSP active; check the browser console for any CSP violation errors on every major page (login, dashboard, tech mobile view). This is the one Phase 1 control that has only been build-verified, not browser-verified. |
| 19 | Origin/CSRF rejection | No | Using a tool like curl, send a mutating request (e.g., `PATCH /api/work-orders/[id]`) with a valid session cookie but a forged `Origin` header pointing at a different domain. Confirm 403. |
| 20 | Health endpoint leaks nothing | Yes (implicitly, by code review) | `curl /api/health` and confirm the response contains no secret values, stack traces, or internal error detail — only `status`/`database`/`latencyMs`/`timestamp`. |

## Sign-off

This plan should be executed against a deployed preview (not local dev, since several checks — headers, CSP, cron secret — depend on production-like configuration) before Phase 1 is merged, per `qa/launch-readiness-checklist.md`'s existing "No phase ships without QA sign-off" rule.
