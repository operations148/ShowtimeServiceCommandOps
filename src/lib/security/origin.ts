/**
 * Same-origin check for cookie-authenticated mutations (security-audit M10 --
 * no CSRF/origin layer existed anywhere; NextAuth's default SameSite=Lax
 * cookie was the only implicit protection).
 *
 * Rejects only when an Origin header IS present and does not match the
 * request's own Host -- a forged cross-site request. Requests with no Origin
 * header (some same-origin non-fetch calls, older clients) are allowed
 * through; SameSite=Lax remains the defense-in-depth layer for those.
 */

import { headers } from "next/headers";

export async function isSameOriginRequest(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return true;

  const host = h.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
