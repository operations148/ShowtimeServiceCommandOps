"use client";

import { WifiOff, RefreshCw, CloudUpload } from "lucide-react";

/**
 * Connectivity status for the technician job view (Phase 8). Shows an offline
 * state (reads are the last-synced snapshot; work is saved locally) or a
 * "syncing queued work" state. Renders nothing when online with nothing queued.
 */
export function OfflineBanner({
  online,
  queuedCount,
  flushing,
  onRetry,
}: {
  online: boolean;
  queuedCount: number;
  flushing: boolean;
  onRetry: () => void;
}) {
  if (online && queuedCount === 0 && !flushing) return null;

  if (!online) {
    return (
      <div className="flex items-center gap-2.5 bg-slate-800 px-4 py-2.5 text-sm text-slate-100">
        <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="flex-1">
          You&apos;re offline. Showing your last-synced data — your work is saved on this device and will sync when you reconnect.
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md bg-slate-700 px-2 py-1 text-xs font-semibold active:bg-slate-600"
        >
          Retry
        </button>
      </div>
    );
  }

  // Online but syncing queued work.
  return (
    <div className="flex items-center gap-2.5 bg-brand-600 px-4 py-2.5 text-sm text-white">
      {flushing ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin" /> : <CloudUpload className="h-4 w-4 shrink-0" />}
      <span className="flex-1">
        {flushing ? "Syncing your saved work…" : `${queuedCount} update${queuedCount === 1 ? "" : "s"} waiting to sync.`}
      </span>
    </div>
  );
}
