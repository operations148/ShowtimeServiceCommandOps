"use client";

/**
 * IndexedDB-backed outbox for technician writes (Phase 8, ADR-0015 §3).
 *
 * This is deliberately NOT a general replay log with conflict resolution. It
 * holds at most ONE latest-wins entry per (visitId, kind); the visit PATCH is a
 * full-state replace, so "last save wins" is the intended semantics for a
 * single technician editing their own visit. It flushes when connectivity
 * returns. The queue-reducer functions are pure and unit-tested; the IndexedDB
 * wrapper is thin and SSR/feature-guarded.
 */

export type OutboxKind = "visit_patch";

export interface OutboxEntry<T = unknown> {
  /** Stable per (visitId, kind) — enqueuing again replaces the prior entry. */
  key: string;
  visitId: string;
  kind: OutboxKind;
  payload: T;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

// ─── Pure queue logic (unit-tested) ──────────────────────────────────────────

export function outboxKeyFor(visitId: string, kind: OutboxKind): string {
  return `${kind}:${visitId}`;
}

/** Latest-wins: replace any existing entry with the same key, else append. */
export function upsertEntry<T>(entries: OutboxEntry<T>[], entry: OutboxEntry<T>): OutboxEntry<T>[] {
  const rest = entries.filter((e) => e.key !== entry.key);
  return [...rest, entry];
}

export function removeEntry<T>(entries: OutboxEntry<T>[], key: string): OutboxEntry<T>[] {
  return entries.filter((e) => e.key !== key);
}

/** Record a failed attempt (bumps attempts, stores lastError) without dropping the entry. */
export function markAttempt<T>(entries: OutboxEntry<T>[], key: string, error?: string): OutboxEntry<T>[] {
  return entries.map((e) => (e.key === key ? { ...e, attempts: e.attempts + 1, lastError: error } : e));
}

export function makeEntry<T>(visitId: string, kind: OutboxKind, payload: T, now = Date.now()): OutboxEntry<T> {
  return { key: outboxKeyFor(visitId, kind), visitId, kind, payload, createdAt: now, attempts: 0 };
}

// ─── IndexedDB wrapper ────────────────────────────────────────────────────────

const DB_NAME = "serviceops-offline";
const DB_VERSION = 1;
const STORE = "outbox";

function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB tx failed"));
  });
}

export async function getAllEntries(): Promise<OutboxEntry[]> {
  if (!idbAvailable()) return [];
  try {
    const db = await openDb();
    const all = await tx<OutboxEntry[]>(db, "readonly", (s) => s.getAll() as IDBRequest<OutboxEntry[]>);
    db.close();
    return all ?? [];
  } catch {
    return [];
  }
}

/** Enqueue latest-wins (put with keyPath 'key' overwrites the prior entry). */
export async function enqueue<T>(entry: OutboxEntry<T>): Promise<void> {
  if (!idbAvailable()) throw new Error("indexedDB unavailable");
  const db = await openDb();
  await tx(db, "readwrite", (s) => s.put(entry));
  db.close();
}

export async function dequeue(key: string): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    await tx(db, "readwrite", (s) => s.delete(key));
    db.close();
  } catch {
    /* ignore */
  }
}

async function recordAttempt(key: string, error?: string): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    const existing = await tx<OutboxEntry | undefined>(db, "readonly", (s) => s.get(key) as IDBRequest<OutboxEntry | undefined>);
    if (existing) {
      await tx(db, "readwrite", (s) => s.put({ ...existing, attempts: existing.attempts + 1, lastError: error }));
    }
    db.close();
  } catch {
    /* ignore */
  }
}

export type SendResult = { ok: true } | { ok: false; retryable: boolean; error?: string };
export type OutboxSender = (entry: OutboxEntry) => Promise<SendResult>;

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

/**
 * Replay every queued entry through `send`. On success, dequeue; on a retryable
 * failure, keep it and record the attempt; on a non-retryable failure (e.g. a
 * 4xx the server will reject forever), dequeue so it can't wedge the queue —
 * the caller surfaces it. Idempotent: safe to call repeatedly / concurrently
 * (each entry key is processed at most once here).
 */
export async function flushOutbox(send: OutboxSender): Promise<FlushResult> {
  const entries = await getAllEntries();
  let sent = 0;
  let failed = 0;
  for (const entry of entries) {
    let result: SendResult;
    try {
      result = await send(entry);
    } catch (err) {
      result = { ok: false, retryable: true, error: err instanceof Error ? err.message : String(err) };
    }
    if (result.ok) {
      await dequeue(entry.key);
      sent += 1;
    } else if (result.retryable) {
      await recordAttempt(entry.key, result.error);
      failed += 1;
    } else {
      // Non-retryable: drop it so the queue can't wedge; caller shows the error.
      await dequeue(entry.key);
      failed += 1;
    }
  }
  const remaining = (await getAllEntries()).length;
  return { sent, failed, remaining };
}
