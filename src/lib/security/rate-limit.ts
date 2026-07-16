/**
 * Durable rate limiting, backed by the `rate_limit_hit` Postgres function
 * (migration 20260711000001). Chosen over an in-memory counter because Vercel
 * serverless functions don't share memory across invocations/instances — an
 * in-memory limiter would reset on every cold start and never actually limit
 * anything in production (see docs/audits/security-audit.md systemic gaps).
 *
 * No new paid service required — this uses the existing Supabase Postgres
 * instance, so it does not trip the phase-prompt's cost-approval gate.
 * If a future phase needs true global low-latency limiting (multi-region),
 * swap this adapter for Upstash without touching call sites.
 */

import { db } from "@/lib/db/client";
import { logger } from "@/lib/security/logger";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitPolicy {
  windowSeconds: number;
  max: number;
}

// Named policies for every surface Phase 1 requires protected.
export const RATE_LIMIT_POLICIES = {
  login:               { windowSeconds: 15 * 60, max: 10 },
  passwordReset:        { windowSeconds: 60 * 60, max: 5 },
  invitationAccept:     { windowSeconds: 15 * 60, max: 10 },
  fileUpload:           { windowSeconds: 60,      max: 20 },
  paymentSessionCreate: { windowSeconds: 60,      max: 10 },
  report:               { windowSeconds: 60,      max: 30 },
  webhook:              { windowSeconds: 60,      max: 120 },
  adminAction:          { windowSeconds: 60,      max: 60 },
  // Public estimate route (unauthenticated) — keyed by IP + token. Views are
  // more frequent than decisions; decisions are additionally one-shot by status.
  publicEstimateView:   { windowSeconds: 60,      max: 30 },
  publicEstimateDecision: { windowSeconds: 60 * 60, max: 10 },
  // Customer portal (Phase 7). Link request is strict (email enumeration /
  // spam); magic-link consume is one-shot but rate-limited defensively;
  // authenticated views/actions mirror the public estimate cadence.
  portalLinkRequest:    { windowSeconds: 60 * 60, max: 5 },
  portalAuth:           { windowSeconds: 60 * 60, max: 10 },
  portalView:           { windowSeconds: 60,      max: 60 },
  portalAction:         { windowSeconds: 60 * 60, max: 20 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

/**
 * Checks and increments the counter for `key` under `policyName` atomically.
 * Fails OPEN (allows the request) if the rate-limit store itself is
 * unreachable — a DB outage should degrade to "unprotected", not "site down",
 * for surfaces already behind auth. Fails CLOSED is the caller's job for
 * pre-auth surfaces (see checkRateLimitOrThrow).
 */
export async function checkRateLimit(
  key: string,
  policyName: RateLimitPolicyName
): Promise<RateLimitResult> {
  const policy = RATE_LIMIT_POLICIES[policyName];
  const { data, error } = await db.rpc("rate_limit_hit", {
    p_key: `${policyName}:${key}`,
    p_window_seconds: policy.windowSeconds,
    p_max: policy.max,
  });

  if (error) {
    logger.error("[rate-limit] store unreachable — failing open", { policyName, error: error.message });
    return { allowed: true, remaining: policy.max, retryAfterSeconds: 0 };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed: boolean; remaining: number; retry_after_seconds: number }
    | undefined;

  if (!row) {
    return { allowed: true, remaining: policy.max, retryAfterSeconds: 0 };
  }

  return {
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfterSeconds: row.retry_after_seconds,
  };
}

/** Extracts a best-effort client identifier for anonymous (pre-auth) rate-limit keys. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
