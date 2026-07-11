# Runbook — Recurring Visit Generation

_Operational runbook for the `generate-visits` cron (Phase 4). For the incident-response baseline see `docs/security/incident-response.md`._

## What it does

`GET /api/cron/generate-visits` (Vercel Cron, weekly) creates work orders + visits for the next 4 weeks from every active, non-paused recurring schedule across all tenants. Occurrence dates come from the tested recurrence module in the **tenant timezone**, minus skip exceptions. Generation is idempotent and duplicate-proof.

## Safety properties

- **Fails closed**: returns 503 if `CRON_SECRET` is unset; 401 on a wrong bearer token (constant-time compared).
- **Idempotent**: an app-layer existence check plus the DB `UNIQUE(recurring_schedule_id, scheduled_date)` index. A replayed or concurrent run creates nothing new — collisions are counted as skips (23505).
- **Per-tenant isolation**: one tenant's failure is caught and recorded; the run continues for the rest.
- **Observable**: every run writes a `cron_runs` row (status, totals, per-tenant results, error). A crashed run is left `status='running'` (visible as stuck).
- **Safe to retry**: because it is idempotent, re-invoking only fills gaps.

## Routine checks

```sql
-- Recent runs
select job_name, status, started_at, finished_at, totals
from cron_runs where job_name = 'generate-visits'
order by started_at desc limit 10;

-- A stuck run (started but never finished)
select * from cron_runs where status = 'running' and started_at < now() - interval '15 minutes';
```

## Common scenarios

### Visits not appearing for a schedule
1. Is the schedule active and not paused? `select is_active, paused_at from recurring_schedules where id = '<id>'`.
2. Are there skip exceptions covering the dates? `select * from recurring_exceptions where schedule_id = '<id>'`.
3. Is the tenant timezone what you expect? `select timezone from tenants where id = '<tenant>'`.
4. **Preview without writing**: `GET /api/recurring-schedules/<id>/preview?weeks=4` shows exactly the dates the cron would generate.

### Manually trigger a generation run
Invoke the cron endpoint with the bearer secret (staging/prod ops only):
```
curl -H "authorization: Bearer $CRON_SECRET" https://<host>/api/cron/generate-visits
```
Safe to run anytime — idempotent. Inspect the returned `runId` in `cron_runs`.

### Duplicate visits suspected
Should be impossible (the unique index). If a duplicate is seen, it predates Phase 4's index or the schedule was cloned — check `recurring_schedule_id` + `scheduled_date` on the work orders; the index prevents new duplicates going forward.

### A run failed
Read the `cron_runs.error` and the `by_tenant` map to see which tenant(s) failed. Fix the underlying cause (often a bad property/technician reference) and re-invoke — the successful tenants are unaffected and the failed one re-fills its gaps.

## Not yet built (later phases)

- Alerting on a failed/stuck run (no monitor is wired to `cron_runs` — Phase 11).
- Dead-letter/backfill UI for a schedule that has been failing for weeks.
- Two-way GHL appointment sync for generated visits (reference columns exist; approved-change sync is deferred).
