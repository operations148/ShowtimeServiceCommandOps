# Estimate Test Plan — Phase 3

Maps the Phase-3 required test list to concrete verification. Unit-tested items are automated (Vitest); the rest are manual steps to run against a deployed preview with the migration applied (several depend on a real DB / real browser / production-like config). Run before Phase 3 is considered closed.

| # | Test | Automated? | Verification |
|---|---|---|---|
| 1 | State machine | Yes (`state-machine.test.ts`) | Illegal transitions rejected; accepted cannot return to draft. |
| 2 | Server-side totals | Yes (`totals.test.ts`) | Totals computed from selected lines only; client-sent totals ignored. |
| 3 | Option selection | Yes (`totals.test.ts`) | One-per-option-group enforced; unknown line id rejected. |
| 4 | Token hashing | Yes (`public-token.test.ts`) | 256-bit token; only SHA-256 hash stored; hash≠token. |
| 5 | Token expiry | Yes (`public-token.test.ts`) + manual | Set `token_expires_at` in the past; GET `/api/public/estimates/[token]` → generic 404. |
| 6 | Token revocation | Partial (unit) + manual | Admin "revoke link" (or override); the old link → generic 404. |
| 7 | Rate limiting | No | Hit `GET /api/public/estimates/[token]` >30×/min from one IP → 429; decisions >10/hr → 429. |
| 8 | Public-field redaction | Yes (`public-serializer.test.ts`) | Serialized JSON contains no cost/markup/tenant/GHL/internal-notes. Additionally `curl` a real token and grep the body. |
| 9 | Accept replay | No | POST accept twice with the same token → second returns `{ alreadyDecided: true }`, no second invoice (check `invoices` count). |
| 10 | Decline replay | No | POST decline twice → second is idempotent success. |
| 11 | Expired estimate | No | Accept an expired estimate → 410, no state change. |
| 12 | Stale version | No | Edit an estimate (bumping version) after loading the public page, then accept with the old version → 409 "reload". |
| 13 | Concurrent acceptance | No | Fire two near-simultaneous accepts (same version) → exactly one succeeds, one gets idempotent/409; exactly one invoice. |
| 14 | Duplicate-conversion prevention | Partial (design: UNIQUE(estimate_id)) | Accept, then force a second conversion → no duplicate invoice (23505 adopts existing). |
| 15 | Override permission + reason | No | As OFFICE_STAFF: override → 403. As TENANT_ADMIN without reason → 422. With reason → re-opens draft, old link revoked, `override` event has the reason. |
| 16 | Cross-tenant public token | No | A Tenant B token resolves only to Tenant B's estimate; no Tenant A data returned. |
| 17 | Email template XSS | Yes (`escape-html.test.ts`) + manual | Set customer_name to `<script>…`; send in preview; inspect rendered HTML — value is escaped. |
| 18 | PDF escaping | Yes (`pdf-text.test.ts`) + manual | Control chars stripped; download a PDF for an estimate with hostile field values and confirm no corruption. |
| 19 | Preview-mode safety | Yes (`safe-mailer.test.ts`) + manual | With `ESTIMATE_EMAIL_MODE` unset, send → no delivery, `preview_mode` event logged, public link returned. |
| 20 | Cost redaction on admin API | Yes (`redact-costs.test.ts`) | As OFFICE_STAFF, GET `/api/estimates/[id]` → no `unit_cost` on lines. |
| 21 | Handoff data preserved | No | The "Needs Estimate" tab still lists technician-flagged work orders after the estimates document layer ships. |

## Sign-off

Run the manual rows against a deployed preview (not local dev — rate limits, headers, and email modes depend on production-like config) per `qa/launch-readiness-checklist.md`'s "no phase ships without QA sign-off" rule. The concurrency (13) and duplicate-conversion (14) checks require a real Postgres; there is no test DB in CI yet (tracked gap, same as Phase 2's sequence concurrency).
