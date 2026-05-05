// GHL outbound sync retry queue — placeholder implementation.
//
// In production this would be backed by a persistent store (a database table,
// Redis list, or message broker) with a background worker that polls on a
// schedule and re-attempts failed items with exponential backoff.
//
// For Phase 5 (mock / dev) items are kept in memory and logged. They survive
// within a single warm server instance but are lost on restart. The queue is
// intentionally read-only from outside this module so nothing else can mutate
// the state accidentally.

export type GHLSyncJobType = "opportunity_won" | "task_create";

export interface GHLSyncQueueItem {
  id: string;
  type: GHLSyncJobType;
  ghl_opportunity_id: string;
  work_order_id: string;
  tenant_id: string;
  /** Exact body that will be sent to the GHL API on retry. */
  payload: Record<string, unknown>;
  enqueuedAt: string;
  /** How many send attempts have been made (including the initial one that failed). */
  attempts: number;
  lastError: string;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const queue: GHLSyncQueueItem[] = [];
let seq = 1;

// ─── Enqueue ──────────────────────────────────────────────────────────────────

export function enqueueGhlSync(
  item: Omit<GHLSyncQueueItem, "id" | "enqueuedAt" | "attempts">
): GHLSyncQueueItem {
  const entry: GHLSyncQueueItem = {
    ...item,
    id: `ghl-sync-${String(seq++).padStart(4, "0")}`,
    enqueuedAt: new Date().toISOString(),
    attempts: 1,
  };

  queue.push(entry);

  console.warn(
    `[ghl/retry-queue] Enqueued ${entry.type} | ` +
    `opp=${entry.ghl_opportunity_id} wo=${entry.work_order_id} | ` +
    `queue depth: ${queue.length}`
  );
  console.warn(
    "[ghl/retry-queue] NOTICE: queue is in-memory only — items lost on restart. " +
    "Wire a persistent queue before production."
  );

  return entry;
}

// ─── Inspection helpers (read-only) ──────────────────────────────────────────

export function getQueueDepth(): number {
  return queue.length;
}

export function getQueueSnapshot(): readonly GHLSyncQueueItem[] {
  return queue;
}
