"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Connectivity tracking for the technician PWA (Phase 8, ADR-0015 §1).
 *
 * navigator.onLine only tells us the browser THINKS it has a link — it's true
 * on a captive-portal wifi with no real internet. So we combine it with a
 * lightweight reachability ping. The pure reducer is exported and unit-tested;
 * the hook wires it to browser events.
 */

export type OnlineEvent =
  | { type: "browser_online" }
  | { type: "browser_offline" }
  | { type: "reach_ok" }
  | { type: "reach_fail" };

export interface OnlineState {
  /** Best guess of REAL reachability (browser link AND a ping succeeded). */
  online: boolean;
  /** navigator.onLine — the browser's own belief. */
  browserOnline: boolean;
  /** null = not yet checked; true/false = last ping result. */
  reachable: boolean | null;
  lastChangeAt: number;
}

export function initialOnlineState(browserOnline: boolean, now: number): OnlineState {
  return { online: browserOnline, browserOnline, reachable: null, lastChangeAt: now };
}

/** Pure: derive online from browser link + last ping. Unknown ping is optimistic. */
function deriveOnline(browserOnline: boolean, reachable: boolean | null): boolean {
  if (!browserOnline) return false;
  return reachable !== false; // online while browser is up unless a ping proved otherwise
}

export function onlineReducer(state: OnlineState, event: OnlineEvent, now: number): OnlineState {
  let browserOnline = state.browserOnline;
  let reachable = state.reachable;

  switch (event.type) {
    case "browser_online":
      browserOnline = true;
      // A regained link invalidates the last (offline) ping result until re-checked.
      reachable = null;
      break;
    case "browser_offline":
      browserOnline = false;
      reachable = false;
      break;
    case "reach_ok":
      reachable = true;
      break;
    case "reach_fail":
      reachable = false;
      break;
  }

  const online = deriveOnline(browserOnline, reachable);
  if (online === state.online && browserOnline === state.browserOnline && reachable === state.reachable) {
    return state; // no-op, keep referential stability
  }
  return { online, browserOnline, reachable, lastChangeAt: now };
}

/** How often to re-check reachability while the page is visible (ms). */
const PING_INTERVAL_MS = 25_000;
const PING_TIMEOUT_MS = 5_000;

async function pingReachable(): Promise<boolean> {
  if (typeof fetch === "undefined") return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
  try {
    // Cache-busted HEAD to a tiny always-available endpoint. no-store so a SW
    // cache can't answer for us (we want a real network probe). ANY HTTP
    // response — even 503 (server up, DB degraded) — proves the network is
    // reachable; only a thrown/aborted fetch means we're actually offline.
    await fetch(`/api/health?_=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      signal: ctrl.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export interface UseOnlineStatus {
  online: boolean;
  browserOnline: boolean;
  /** Force an immediate reachability re-check (e.g. a manual "retry now"). */
  recheck: () => void;
}

/**
 * Live connectivity for client components. Safe on the server (returns online).
 */
export function useOnlineStatus(): UseOnlineStatus {
  const [state, setState] = useState<OnlineState>(() =>
    initialOnlineState(typeof navigator === "undefined" ? true : navigator.onLine, Date.now())
  );
  const mounted = useRef(true);

  const dispatch = useCallback((event: OnlineEvent) => {
    setState((prev) => onlineReducer(prev, event, Date.now()));
  }, []);

  const recheck = useCallback(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      dispatch({ type: "browser_offline" });
      return;
    }
    void pingReachable().then((ok) => {
      if (mounted.current) dispatch({ type: ok ? "reach_ok" : "reach_fail" });
    });
  }, [dispatch]);

  useEffect(() => {
    mounted.current = true;
    const onOnline = () => { dispatch({ type: "browser_online" }); recheck(); };
    const onOffline = () => dispatch({ type: "browser_offline" });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    recheck(); // initial probe
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") recheck();
    }, PING_INTERVAL_MS);

    return () => {
      mounted.current = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [dispatch, recheck]);

  return { online: state.online, browserOnline: state.browserOnline, recheck };
}
