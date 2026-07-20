/**
 * Technician-location freshness (Phase 12, ADR-0018 §2). A last-known position
 * is only useful if its age is shown — a stale ping presented as live is a lie
 * a dispatcher would act on. Pure + unit-tested.
 */

export type Freshness = "live" | "recent" | "stale";

export const LIVE_MAX_SECONDS = 2 * 60;    // <=2 min: effectively live (foreground pinging)
export const RECENT_MAX_SECONDS = 15 * 60; // <=15 min: recent
// older than that: stale (app was likely closed — a PWA can't ping in the background)

export function ageSeconds(recordedAtIso: string, nowMs: number = Date.now()): number {
  const t = Date.parse(recordedAtIso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((nowMs - t) / 1000));
}

export function freshnessOf(recordedAtIso: string, nowMs?: number): Freshness {
  const age = ageSeconds(recordedAtIso, nowMs);
  if (age <= LIVE_MAX_SECONDS) return "live";
  if (age <= RECENT_MAX_SECONDS) return "recent";
  return "stale";
}

/** Human label, e.g. "just now", "6 min ago", "3 h ago", "2 d ago". */
export function relativeAgeLabel(recordedAtIso: string, nowMs?: number): string {
  const age = ageSeconds(recordedAtIso, nowMs);
  if (!Number.isFinite(age)) return "unknown";
  if (age < 45) return "just now";
  const min = Math.round(age / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(age / 3600);
  if (hr < 24) return `${hr} h ago`;
  const d = Math.round(age / 86400);
  return `${d} d ago`;
}
