# Scheduling Test Plan — Phase 4

Maps the Phase-4 required test list to concrete verification. Unit-tested items are automated (Vitest); the rest are manual/live-DB steps to run against a deployed preview with the migration applied. Run before Phase 4 is considered closed.

| # | Test | Automated? | Verification |
|---|---|---|---|
| 1 | Schedule permission | Partial (`roles.test.ts`) | As READ_ONLY_OWNER: GET /api/schedule ok, POST reschedule → 403. As TECHNICIAN: only own visits returned. |
| 2 | Cross-tenant schedule denial | No | Tenant A user requesting a Tenant B visit id (assign/reschedule/detail) → 404. |
| 3 | Drag/drop API update | No | Drop a visit on another day → POST /api/visits/[id]/reschedule updates scheduled_date; reload shows the move. |
| 4 | Stale version conflict | No | Load a visit, edit it elsewhere (version bumps), then assign/reschedule with the old version → 409 + currentVersion. |
| 5 | Multi-technician assignment | No | Assign a lead + 2 assistants → visit.technician_id = lead, visit_assignments has 3 rows (1 lead, 2 assistant). |
| 6 | Read-only denial | Partial (`roles.test.ts`) | READ_ONLY_OWNER cannot assign/reschedule/blocked-time (403). |
| 7 | Technician own-visit scoping | No | Technician GET /api/schedule returns only visits they lead or assist on; /api/visits/[id]/detail for someone else's visit → 404. |
| 8 | DST | Yes (`timezone.test.ts`) | Spring-forward day = 23h range, fall-back = 25h; nonexistent 02:30 converges. Also manually: reschedule across Mar 8 / Nov 1 and confirm displayed times. |
| 9 | Cross-midnight | Yes (`timezone.test.ts`) | A 23:30 local instant maps to the correct local date; day range covers the full local day in UTC. |
| 10 | Recurrence | Yes (`recurrence.test.ts`) | weekly/biweekly/monthly expansion, clamping, endsOn, parity. |
| 11 | Recurrence duplicate prevention | Partial (design + unit) | Run the cron twice → second run creates 0 (all skipped). Confirm `UNIQUE(recurring_schedule_id, scheduled_date)` blocks a forced duplicate insert. |
| 12 | Cron missing secret | No | Unset CRON_SECRET in staging → GET /api/cron/generate-visits → 503. **Never test against prod.** |
| 13 | Cron replay | No | Invoke the cron endpoint twice in a row → second returns totals with created=0/all skipped; `cron_runs` has two rows. |
| 14 | GHL sync idempotency | No | (Reference-column stage) confirm generated visits carry `ghl_sync_state='none'` and no duplicate GHL appointment is created (no two-way sync yet). |
| 15 | Visit list + detail E2E | No | /dashboard/visits list filters by date/status/search; a row opens the detail with checklist/photos/assignments/audit. |
| 16 | Mobile calendar behavior | No | /dashboard/schedule on a phone: week grid scrolls horizontally; Assign/Move buttons are ≥44px; Reschedule dialog is keyboard-operable. |
| 17 | Conflict warning | No | Assign two visits to the same tech on the same day → both cards show a "Double-booked" warning; the assignment still succeeds (non-blocking). |
| 18 | Pause / skip | No | Pause a schedule → preview returns []. Skip one date → that date is absent from preview and the next cron run. |
| 19 | Blocked time | No | Create blocked time for a tech; confirm it lists within a range query and deletes. |
| 20 | Availability | No | PUT a weekly template for a tech; GET returns it; a technician can GET their own but not another's (403). |

## Sign-off

Run the manual rows against a deployed preview (rate limits, cron secret, and timezone all depend on production-like config) per `qa/launch-readiness-checklist.md`. Items 4, 11, 13 require a real Postgres — no test DB in CI yet (same standing gap as Phases 2–3).
