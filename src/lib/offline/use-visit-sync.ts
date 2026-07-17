"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useOnlineStatus } from "./online-status";
import { isOfflineSyncEnabled } from "./flags";
import {
  makeEntry, enqueue, getAllEntries, dequeue, outboxKeyFor,
  type OutboxEntry,
} from "./outbox";

/**
 * Transport for the technician visit submit (Phase 8, ADR-0015 §3). Sends the
 * visit PATCH when online; when offline, enqueues it in the IndexedDB outbox so
 * the completion survives an app kill and flushes automatically on reconnect.
 * The visit PATCH is a full-state replace and idempotent, so a replay can't
 * double-fire completion/handoff side-effects. Draft persistence lives in the
 * component (see drafts.ts); this hook owns the online/queue/flush concern.
 */

export type SubmitOutcome = "done" | "queued" | "error";
export interface SubmitResult {
  outcome: SubmitOutcome;
  /** Present when outcome === "error" (a non-retryable server rejection). */
  error: string | null;
}

interface Options {
  visitId: string;
  /** Called when a PREVIOUSLY QUEUED submit for this visit later flushes OK. */
  onQueuedSynced?: () => void;
}

export interface VisitSyncApi {
  online: boolean;
  enabled: boolean;
  submit: (payload: Record<string, unknown>) => Promise<SubmitResult>;
  queuedCount: number;
  flushing: boolean;
  syncError: string | null;
  clearSyncError: () => void;
  recheck: () => void;
}

async function patch(visitId: string, payload: Record<string, unknown>): Promise<{ ok: true } | { ok: false; retryable: boolean; error: string }> {
  try {
    const res = await fetch(`/api/visits/${visitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    // 4xx (validation / completion gate) is non-retryable — the same body will
    // fail forever; surface it. 5xx / network is retryable.
    const retryable = res.status >= 500;
    return { ok: false, retryable, error: json.error ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, retryable: true, error: err instanceof Error ? err.message : "Network error" };
  }
}

export function useVisitSync({ visitId, onQueuedSynced }: Options): VisitSyncApi {
  const enabled = isOfflineSyncEnabled();
  const { online, recheck } = useOnlineStatus();
  const [queuedCount, setQueuedCount] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const onQueuedSyncedRef = useRef(onQueuedSynced);
  onQueuedSyncedRef.current = onQueuedSynced;
  const flushingRef = useRef(false);

  const myKey = outboxKeyFor(visitId, "visit_patch");

  const refreshCount = useCallback(async () => {
    if (!enabled) return;
    const all = await getAllEntries();
    setQueuedCount(all.filter((e) => e.visitId === visitId).length);
  }, [enabled, visitId]);

  useEffect(() => { void refreshCount(); }, [refreshCount]);

  const flush = useCallback(async () => {
    if (!enabled || flushingRef.current) return;
    const all = await getAllEntries();
    const mine = all.find((e) => e.key === myKey);
    if (!mine) return;
    flushingRef.current = true;
    setFlushing(true);
    try {
      const entry = mine as OutboxEntry<Record<string, unknown>>;
      const result = await patch(visitId, entry.payload);
      if (result.ok) {
        await dequeue(myKey);
        onQueuedSyncedRef.current?.();
      } else if (!result.retryable) {
        // Non-retryable: drop so it can't wedge, surface the reason.
        await dequeue(myKey);
        setSyncError(result.error);
      }
      // retryable: leave it; the next online tick retries.
    } finally {
      flushingRef.current = false;
      setFlushing(false);
      await refreshCount();
    }
  }, [enabled, myKey, visitId, refreshCount]);

  // Flush whenever we're (back) online with something queued.
  useEffect(() => {
    if (enabled && online && queuedCount > 0) void flush();
  }, [enabled, online, queuedCount, flush]);

  const submit = useCallback(
    async (payload: Record<string, unknown>): Promise<SubmitResult> => {
      setSyncError(null);
      // Online path first (also the only path when the flag is off).
      if (!enabled || online) {
        const result = await patch(visitId, payload);
        if (result.ok) return { outcome: "done", error: null };
        if (!enabled) { setSyncError(result.error); return { outcome: "error", error: result.error }; }
        if (!result.retryable) { setSyncError(result.error); return { outcome: "error", error: result.error }; }
        // Retryable failure while nominally "online" (flaky link) → queue it.
        await enqueue(makeEntry(visitId, "visit_patch", payload));
        await refreshCount();
        return { outcome: "queued", error: null };
      }
      // Offline → queue for auto-flush on reconnect.
      await enqueue(makeEntry(visitId, "visit_patch", payload));
      await refreshCount();
      return { outcome: "queued", error: null };
    },
    [enabled, online, visitId, refreshCount]
  );

  const clearSyncError = useCallback(() => setSyncError(null), []);

  return { online, enabled, submit, queuedCount, flushing, syncError, clearSyncError, recheck };
}
