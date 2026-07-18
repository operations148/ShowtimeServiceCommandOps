/**
 * Platform-admin kill-switch (Phase 10, master plan's `platform_admin_enabled`).
 *
 * The cross-tenant admin surface is the highest-privilege surface in the app —
 * it deliberately steps outside the per-tenant scoping every other query obeys
 * — so it ships behind an explicit flag that turns it off without a code change.
 *
 * Default OFF: cross-tenant access is opt-in, never silently present the moment
 * the code lands. Set NEXT_PUBLIC_PLATFORM_ADMIN_ENABLED="true" to enable.
 *
 * NEXT_PUBLIC (readable client-side) is fine here: the flag only says whether
 * the feature is ON, which isn't sensitive — the DATA is protected by the
 * canManageTenants permission, enforced server-side on every route regardless
 * of this flag. Client-readability lets the nav hide the entry cleanly. The
 * same env var is read server-side (the value is inlined for both).
 */
export function isPlatformAdminEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ENABLED === "true";
}
