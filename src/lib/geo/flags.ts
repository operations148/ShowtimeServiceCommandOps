/**
 * Technician-location kill-switch (Phase 12, ADR-0018 §2). Disables capture
 * and display without a code change. Default ON. NEXT_PUBLIC so both the
 * client (capture hook) and the server (ping route, map context) read the same
 * value — the feature's existence isn't sensitive; the data is role-gated.
 */
export function isTechLocationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TECH_LOCATION_ENABLED !== "false";
}
