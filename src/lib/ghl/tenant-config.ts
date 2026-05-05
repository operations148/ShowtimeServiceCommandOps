// Environment-based lookups for GHL → ServiceOps tenant and user resolution.
// All functions return undefined on misconfiguration rather than throwing,
// so callers can log and skip cleanly.

/**
 * Resolves a GHL locationId to a ServiceOps tenantId.
 * Reads GHL_LOCATION_TO_TENANT env var, expected format:
 *   {"ve9EPM428h8vShlRW1KT":"tenant-showtime"}
 */
export function resolveTenantId(locationId: string): string | undefined {
  const raw = process.env.GHL_LOCATION_TO_TENANT;
  if (!raw) return undefined;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[locationId] ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves a GHL user ID to a ServiceOps technician ID.
 * Reads GHL_USER_TO_TECHNICIAN env var, expected format:
 *   {"ghl_user_Jk5LmNpQrStUvW":"tech-001"}
 * Returns undefined if unmapped — caller should set assigned_technician_id to undefined
 * and log the unmapped GHL user ID for the admin to configure.
 */
export function resolveGhlUserToTechId(ghlUserId: string | undefined): string | undefined {
  if (!ghlUserId) return undefined;
  const raw = process.env.GHL_USER_TO_TECHNICIAN;
  if (!raw) return undefined;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[ghlUserId] ?? undefined;
  } catch {
    return undefined;
  }
}
