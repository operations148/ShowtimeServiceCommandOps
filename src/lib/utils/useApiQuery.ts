"use client";

import { useState, useEffect, useCallback } from "react";

interface ApiQueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export interface UseApiQueryResult<T> extends ApiQueryState<T> {
  retry: () => void;
}

/**
 * Decides the resulting state from an HTTP response. Extracted as a pure
 * function so the rule can be unit-tested without a DOM or React renderer
 * (this repo has no component-test infrastructure, and this decision — not
 * the rendering — is what the Prompt 11 hardening changed).
 *
 * The rule that matters: a non-2xx response is an ERROR even when its body
 * carries no `error` key. Previously only `json.error` was consulted, so any
 * failing response that omitted that key was reported as a successful empty
 * result — which the work-order table then rendered as the friendly
 * "No work orders yet" empty state. A server failure must never be
 * indistinguishable from an empty collection.
 */
export function resolveQueryState<T>(
  res: { ok: boolean; status: number },
  json: { data?: T; error?: string } | null,
): ApiQueryState<T> {
  if (!res.ok) {
    return {
      data: null,
      error: json?.error ?? `Request failed (${res.status})`,
      loading: false,
    };
  }
  if (json?.error) {
    return { data: null, error: json.error, loading: false };
  }
  return { data: json?.data ?? null, error: null, loading: false };
}

/**
 * Wraps fetch with consistent loading / error / data states.
 *
 * - Auto-fetches on mount and whenever `url` changes.
 * - Expects the API to return `{ data: T }` or `{ error: string }`.
 * - `retry` re-runs the fetch immediately.
 *
 * Usage:
 *   const { data, error, loading, retry } = useApiQuery<WorkOrder[]>("/api/work-orders");
 */
export function useApiQuery<T>(url: string): UseApiQueryResult<T> {
  const [state, setState] = useState<ApiQueryState<T>>({
    data: null,
    error: null,
    loading: true,
  });

  const execute = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(url);

      // Parse defensively: a non-2xx response is not guaranteed to carry a
      // JSON body (a platform-level error page, a gateway timeout).
      let json: { data?: T; error?: string } = {};
      try {
        json = (await res.json()) as { data?: T; error?: string };
      } catch {
        json = {};
      }

      // Checks the STATUS, not just the body shape — see resolveQueryState.
      setState(resolveQueryState<T>(res, json));
    } catch (e) {
      setState({
        data: null,
        error: e instanceof Error ? e.message : "Something went wrong",
        loading: false,
      });
    }
  }, [url]);

  useEffect(() => {
    void execute();
  }, [execute]);

  const retry = useCallback(() => {
    void execute();
  }, [execute]);

  return { ...state, retry };
}
