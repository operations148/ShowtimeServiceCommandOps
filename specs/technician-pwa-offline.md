# Spec — Technician PWA & Offline Resilience (Phase 8)

**Status:** Code-complete (branch `feat/serviceops-phase-8-technician-pwa`)
**Related:** ADR-0015 (offline strategy decision), `qa/technician-offline-test-plan.md`, `memory/phase-8-technician-pwa.md`

## 1. Purpose

Make the technician PWA usable in the field when signal is weak or absent, without introducing a full offline replay engine. Techs can open today's jobs and their checklists offline (last-synced snapshot), never lose notes/checklist edits to a dropped connection, and have their work auto-sync when connectivity returns. All gated by an instant kill-switch.

This is **resilient online-first**, not full offline sync — see ADR-0015 for why.

## 2. What a technician gets

| Capability | Behavior |
|---|---|
| **Open a job offline** | Today's jobs list and visit reads are served from the last-synced cache (NetworkFirst). Clearly labeled as offline/stale. |
| **Complete checklist + notes offline** | Every edit is persisted locally per visit and restored on reload. Nothing is lost to a dropped connection, backgrounded tab, or app kill. |
| **Save offline** | The visit save is enqueued in an IndexedDB outbox and flushes automatically when back online. |
| **Photos offline** | Captured photos are held locally and upload auto-retries on reconnect; a client photo id prevents duplicate uploads. |
| **Connectivity awareness** | An online/offline indicator; "saved locally — will sync" vs "synced" states; a manual "retry now" affordance. |

## 3. Architecture

### 3.1 Service worker (reads)
`next-pwa` `runtimeCaching` populated:
- **App shell / static** — precached (build output) + StaleWhileRevalidate for `_next/static`.
- **Today's jobs + visit reads** (`GET /api/visits*`) — **NetworkFirst** with a short timeout, falling back to the cached snapshot offline.
- Writes (POST/PATCH/DELETE) are **never** cached or served from cache.

### 3.2 Client offline core (`src/lib/offline/`)
- `flags.ts` — reads `NEXT_PUBLIC_OFFLINE_SYNC_ENABLED` (default on); one place the whole layer checks.
- `online-status.ts` — pure reducer + `useOnlineStatus()` hook (navigator.onLine + online/offline events + a lightweight reachability ping).
- `drafts.ts` — per-visit draft persistence (checklist + notes) in `localStorage`, pure serialize/merge helpers.
- `outbox.ts` — IndexedDB-backed queue of pending writes (one latest-wins entry per `(visitId, kind)`), pure queue-reducer logic split out for tests; `flushOutbox()` replays entries when online, idempotently.
- `photo-id.ts` — generates a stable client photo id per capture.

### 3.3 Server (idempotency, additive)
- **Visit PATCH** (`/api/visits/[id]`) — unchanged; already idempotent (full-state replace; side-effects self-guard against the existing row).
- **Photo POST** (`/api/visits/[id]/photos`) — accepts an optional `client_photo_id` form field. The stored object name embeds it; on a repeat id the server returns the existing object (200) instead of uploading a duplicate. Backward compatible (absent id → prior timestamp behavior).
- **No migration.**

## 4. Kill-switch

`NEXT_PUBLIC_OFFLINE_SYNC_ENABLED` (default `true`). When `false`: no service-worker runtime caching of app data is used by the client offline layer, no outbox/draft behavior — the app is plain online-only. Env-based deliberately (a data-integrity kill-switch must not depend on a network read). Takes effect on next load.

## 5. Explicitly out of scope (ADR-0015 §4)

- No ordered multi-mutation replay log across visits.
- No conflict-resolution / field-merge engine.
- No offline creation of new visits/work orders (techs act on already-assigned visits).
- No offline auth (session must have been established while online; cached reads are gated by the last valid session).

## 6. Failure & edge behavior

- **Stale read:** offline reads are labeled; the tech knows they may not reflect dispatch changes made while they were offline.
- **Outbox conflict-free by design:** one latest-wins entry per visit; the server PATCH is a full replace, so "last save wins" is the intended, understood semantics (a single tech editing their own visit — no concurrent editor).
- **Completion offline:** the completion-requirements gate runs **server-side** on flush, so an offline "complete" that fails the gate surfaces as a sync error to fix, never a false local success that diverges from the server.
- **Photo cap / validation:** enforced server-side on flush as today (max 10, magic-byte re-encode); an offline capture that violates them surfaces on sync.

## 7. QA / gates

See `qa/technician-offline-test-plan.md`. Pure modules (online-status reducer, outbox queue logic, draft merge, photo-id) are unit-tested. Gates: tsc clean · lint no new errors · vitest green · build passing.
