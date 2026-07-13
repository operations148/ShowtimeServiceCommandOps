# ADR-0004 — Durable GHL Outbound Sync via Postgres Outbox, Not a Queue Service

**Status**: Accepted
**Date**: 2026-07-11
**Context**: Phase 0 security-audit L7 — `src/lib/ghl/retry-queue.ts` was an in-memory array, losing all pending retries on every cold start/redeploy.

## Decision

Replace the in-memory queue with a durable outbox table (`ghl_sync_outbox`, migration `20260711000001`) drained by a new cron route (`GET /api/cron/drain-ghl-outbox`, every 15 minutes via `vercel.json`), rather than adopting a dedicated queue service (e.g., Upstash QStash, Inngest, a Redis-backed queue).

## Rationale

- **No new paid service required.** The outbox lives in the same Supabase Postgres instance every other table already uses — no new vendor relationship, no cost-approval gate to clear (the phase-prompt explicitly calls out stopping at a cost-approval gate when a new paid service is needed; this avoids triggering it).
- **Volume is low.** This is a single-tenant-in-practice pool-service app; outbound GHL sync events are one per completed work order and one per flagged estimate — dozens per day at most, not a throughput profile that needs a purpose-built queue's ordering/concurrency guarantees.
- **The failure mode being fixed doesn't need sub-second latency.** GHL sync retries are already tolerant of minutes-scale delay (the whole point is that the *first* attempt already failed and the admin dashboard already surfaces `ghl_sync_failed`); a 15-minute drain cadence is more than adequate and keeps the cron footprint aligned with the existing `generate-visits` cron already in `vercel.json`.
- **Consistent with the rate-limiter decision** (also Phase 1): both durable-state problems (rate limiting, outbound retry) are solved with a Postgres table + a small amount of application logic rather than reaching for a new managed service, keeping the infrastructure surface area minimal for a single-tenant deployment.

## Design

- `ghl_sync_outbox` rows: `tenant_id`, `job_type` (`opportunity_won` | `task_create`), `ghl_opportunity_id`, `work_order_id`, `payload` (JSONB — the exact body to resend), `status` (`pending` → `processing` → `done` | `dead_letter`), `attempts`, `last_error`, `next_attempt_at`.
- Exponential backoff (60s base, doubling, capped at 1h) between attempts; `MAX_ATTEMPTS = 8` before a row moves to `dead_letter` and stops being retried automatically (an admin can inspect and manually resolve dead-lettered rows — no UI for this yet, direct DB access only, noted as a Phase 4/10 follow-up).
- The drain cron claims rows (`status = 'processing'`) before calling GHL, so a second concurrent drain invocation (e.g., a slow previous run still finishing when the next cron fires) doesn't double-send the same sync.

## Consequences

- If GHL sync volume grows enough that a 15-minute drain cadence becomes materially too slow (e.g., dozens of tenants, hundreds of syncs/hour), this ADR should be revisited — at that scale a real queue service earns its cost and complexity. Not a concern at current scale.
- `src/app/api/cron/drain-ghl-outbox` reuses the same fail-closed `CRON_SECRET` pattern as `generate-visits` (Phase 1's H3 fix) rather than inventing a new auth scheme for this endpoint.
