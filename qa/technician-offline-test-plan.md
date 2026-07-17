# QA Test Plan — Technician PWA & Offline Resilience (Phase 8)

Manual + automated coverage for the offline layer. Automated (pure logic): `src/lib/offline/{outbox,online-status,drafts,photo-id}.test.ts` (23 tests). Run: `npx vitest run src/lib/offline`.

**Important:** offline behavior only runs in a **production build** (`next-pwa` disables the service worker in dev) and with `NEXT_PUBLIC_OFFLINE_SYNC_ENABLED` unset or `true`. Test on an installed PWA or with DevTools → Network → Offline against a `next build && next start` server.

## 1. Offline reads (last-synced snapshot)
| # | Step | Expected |
|---|---|---|
| 1.1 | Online, open `/tech/today`, then a job. Go offline (airplane mode / DevTools offline). Reload the job. | Job view still loads from cache; connectivity banner shows "You're offline… last-synced data". |
| 1.2 | Offline, open a job **never viewed while online**. | Graceful failure (not a crash) — no cached copy exists. |
| 1.3 | Reconnect. | Banner clears; a fresh fetch replaces the snapshot. |

## 2. Drafts never lost
| # | Step | Expected |
|---|---|---|
| 2.1 | On a job, tick several checklist items + type notes. Go offline. Reload the page. | Checklist + notes are **restored** from the local draft. |
| 2.2 | Type notes, then fully close the tab/app (still offline). Reopen the job. | Draft restored. |
| 2.3 | Complete the job successfully (online). | Draft is cleared (no stale restore on the next visit open). |

## 3. Submit while offline (outbox)
| # | Step | Expected |
|---|---|---|
| 3.1 | Offline, complete a job (checklist done + completion message). | "Saved on your device" screen; message that it will submit on reconnect. No error. |
| 3.2 | Still offline, kill the app. Reopen while **online**. | The queued completion flushes automatically (outbox in IndexedDB survived the kill); the visit is COMPLETED server-side. |
| 3.3 | From 3.1, restore connectivity with the screen open. | Auto-advances to the normal completion/estimate done screen. |
| 3.4 | Offline, flag an estimate. | Queued the same way; syncs on reconnect; work order goes ESTIMATE_NEEDED + GHL sync fires (server-side, on flush). |
| 3.5 | Queue an offline completion whose checklist is actually incomplete (force a server gate failure), then reconnect. | Non-retryable rejection is surfaced ("Couldn't submit… reopen to fix"); the entry is dropped, not wedged. |

## 4. Submit idempotency (retry safety)
| # | Step | Expected |
|---|---|---|
| 4.1 | Cause a flaky reconnect so the outbox flushes twice for the same completion. | Visit ends COMPLETED once; no double work-order update, no duplicate estimate handoff (PATCH is a full-state replace; side-effects self-guard). |

## 5. Photos offline
| # | Step | Expected |
|---|---|---|
| 5.1 | Offline, add a photo. | Thumbnail shows with a "Will upload" badge; counts toward the 10-photo cap. |
| 5.2 | Reconnect. | Queued photo auto-uploads; badge clears. |
| 5.3 | Force the upload to run twice for the same captured photo (retry). | Exactly one stored object — the `client_photo_id` dedup returns the existing object on the second attempt (no duplicate in `photo_urls`). |
| 5.4 | Retry a photo whose first upload actually succeeded, when the visit is at the 10-photo cap. | Idempotent success (returns existing), NOT a "max photos" rejection — dedup runs before the cap check. |
| 5.5 | Upload with **no** `client_photo_id` (legacy/admin path). | Works as before (timestamped filename). |

## 6. Connectivity UX
| # | Step | Expected |
|---|---|---|
| 6.1 | Captive-portal wifi (browser online, no real internet). | The reachability ping fails → treated as offline (not falsely online). |
| 6.2 | Tap "Retry" / "Check connection". | Immediate re-probe; state updates. |
| 6.3 | Online with queued work. | Banner shows "N updates waiting to sync" / "Syncing…". |

## 7. Kill-switch
| # | Step | Expected |
|---|---|---|
| 7.1 | Build/deploy with `NEXT_PUBLIC_OFFLINE_SYNC_ENABLED=false`. | No offline banner, no drafts, no outbox — plain online-only behavior; SW runtimeCaching is empty. |
| 7.2 | Flip back to unset/`true` and rebuild. | Offline layer returns. |

## 8. Scope / non-leakage
| # | Step | Expected |
|---|---|---|
| 8.1 | Confirm the SW only runtime-caches `/tech` navigations and `GET /api/visits*`. | Dashboard and `/portal/*` are **not** runtime-cached (portal stays no-store, Phase 7). |
| 8.2 | POST/PATCH/DELETE requests. | Never served from cache. |

## 9. Known limitations (documented, not bugs)
- Offline reads are the last-synced snapshot, not live (no client can show live data offline).
- A photo captured offline and then the app killed **before reconnect** is not persisted across the kill (binary blob persistence is out of scope; text drafts are persisted). The queued-submit *does* survive a kill via the outbox.
- Concurrent duplicate photo uploads (same id, two tabs, truly simultaneous) can still both land — the dedup covers sequential retries, the real offline case.

## 10. Regression gate
`npx tsc --noEmit` clean · `npx next lint` no new errors · `npx vitest run` all green · `npm run build` succeeds (SW + runtimeCaching compile).
