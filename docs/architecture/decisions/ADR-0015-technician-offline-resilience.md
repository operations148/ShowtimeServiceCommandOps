# ADR-0015 — Technician PWA: Resilient Online-First (Outbox), Not a Full Offline Replay Engine

**Status:** Accepted (Phase 8, 2026-07-17)

## Context

`next-pwa` was installed from the scaffold with `runtimeCaching: []` — the app was *installable* but had no real offline strategy, and the roadmap implied offline support existed. Phase 8's mandate (master plan) was to either build a real offline-mutation queue or make a documented decision and stop implying offline support. Field technicians for a pool-service business genuinely lose signal — fenced backyards, rural properties — so "installable, online-only" leaves real value on the table, but a full offline replay engine with conflict resolution is the highest data-integrity risk in the app.

The technician write surface is small and well-shaped: on a single visit a tech toggles checklist items, edits notes, uploads/deletes photos, and PATCHes visit status/completion. A tech works their **own** visits **sequentially** and reconnects frequently (driving between stops). This shape matters — it's what makes the middle path correct.

## Decision

Build **resilient online-first**: reads survive offline from a cached snapshot, writes never lose the technician's work and auto-retry on reconnect — but the write path is an **idempotent outbox**, not a general multi-mutation replay engine with conflict resolution. Concretely:

### 1. Offline reads from a cached snapshot (never "live")

The service worker caches the tech app shell (precache) and serves today's jobs / visit reads via **NetworkFirst** (network when online, last-cached response when not). This is explicitly the *last-synced* snapshot — no client can show live server state offline, and the UI labels stale reads as such. This is the single biggest field win: a tech in a dead-zone backyard can still open their job and checklist.

### 2. Drafts are never lost

Checklist state and notes are persisted locally (per visit) the moment they change, and restored on load. A dropped connection, a backgrounded tab, or a killed app never costs a tech the work they just did. This is local-only state, distinct from the committed server record.

### 3. Writes go through an idempotent outbox, auto-flushed on reconnect

A single pending write per visit (the visit PATCH — a full-state replace) is enqueued in an IndexedDB **outbox**; when connectivity returns (or immediately when online) the outbox flushes. The visit PATCH is **naturally idempotent** — it replaces checklist/notes/status wholesale, and its side-effects (`estimate_flagged` false→true, status →COMPLETED) self-guard because they compare against the existing row, so a replay can't double-fire a handoff or a completion. Photo uploads carry a **client-generated photo id** embedded in the stored object name; the server treats a repeat id as a no-op and returns the existing object, so an auto-retried upload can't create a duplicate. **No new database schema** — idempotency is a property of the existing endpoints plus one client id.

### 4. Deliberately NOT built: a general replay queue with conflict resolution

We are not queueing an ordered log of arbitrary mutations across many visits to replay against a diverging server, and not writing field-level merge/conflict rules. Rationale:
- **Risk:** conflict-resolution bugs corrupt or silently lose completed-job records — the master plan flags this as the biggest data-integrity risk in the product.
- **Marginal benefit is small for this workflow:** the queue only out-performs the outbox in the "entire multi-hour shift, zero signal, never reconnecting between jobs" case. Pool techs reconnect constantly; the outbox already covers "complete this job offline, it syncs when I get signal."
- **Cost scales badly:** every future mutation type (Phase 9 time/mileage/expenses, change orders) would have to be taught to the queue and given conflict rules — a growing corruption surface. The outbox's guarantees are uniform and cheap to extend.

The outbox is deliberately the *primitive a full queue is built on*, so if real usage ever proves full-shift offline writes are needed, we extend rather than rewrite.

### 5. Instant kill-switch

The whole offline layer is gated by `NEXT_PUBLIC_OFFLINE_SYNC_ENABLED` (client-readable env flag, default on). Set it to `false` and the app reverts to plain online-only behavior on next load — no deploy of new code required to disable a data-integrity concern in the field. (This is the first feature-flag the master plan called for; it's env-based rather than a DB table because a kill-switch must not itself depend on a network read.)

## Consequences

- **Real field value, low risk:** techs read jobs offline, never lose drafts, and their completions sync automatically — without a distributed-systems conflict engine.
- **Server changes are minimal and additive:** the visit PATCH is untouched (already idempotent); the photo POST gains an optional `client_photo_id` dedup. No migration.
- **Honest docs:** the roadmap/README stop implying full offline sync; they describe resilient online-first accurately (see `specs/technician-pwa-offline.md`).
- **A clean upgrade path** to a full queue exists if warranted, built on the same outbox.
- **The kill-switch is env-based**, so toggling it requires setting the Vercel env var and a redeploy/restart to take effect for SSR-embedded reads; the client reads it at runtime from a public value, so the switch is fast but not instantaneous across already-loaded sessions (they pick it up on next load).

## Alternatives considered

- **Full offline-mutation queue + conflict resolution** — rejected (Decision 4): highest data-integrity risk, small marginal benefit for a sequential single-tech workflow, poor cost-scaling.
- **Installable-only + docs, no offline reads/drafts** — rejected: minimal effort but leaves the actual dead-zone-backyard pain unsolved; techs still couldn't open a job offline.
- **DB-backed feature flag** — rejected for the kill-switch specifically: a switch meant to protect against field data-integrity issues must not depend on a network/DB read to evaluate.
