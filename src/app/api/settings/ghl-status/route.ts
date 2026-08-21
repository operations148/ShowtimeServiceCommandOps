import { NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { resolveTenantId } from "@/lib/ghl/tenant-config";
import { ghlFetch } from "@/lib/ghl/client";
import { logger } from "@/lib/security/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/settings/ghl-status
//
// AUTHENTICATED (canManageSettings). Reports the GHL integration state as
// three DISTINCT facts rather than one misleading badge:
//
//   1. configured        — the env vars exist (what the old UI checked)
//   2. tenantMapped      — GHL_LOCATION_TO_TENANT actually resolves this
//                          location to a tenant. Without this, every inbound
//                          webhook is discarded as unknown_tenant even though
//                          everything "looks" configured.
//   3. apiReachable      — a real authenticated call to the GHL API succeeded,
//                          proving the private integration token is valid
//                          right now, not merely present.
//
// The old Settings panel rendered "Connected" purely from the presence of a
// NEXT_PUBLIC_GHL_LOCATION_ID string at build time. During this incident it
// showed "Connected" the entire time inbound webhooks were failing — which is
// exactly the kind of false reassurance this endpoint exists to remove.
//
// Deliberately authenticated, not public: it discloses integration internals.
// Never returns token values, secrets, tenant IDs or location IDs.
// ---------------------------------------------------------------------------

interface GhlStatusResponse {
  configured: {
    locationId: boolean;
    webhookSecret: boolean;
    privateToken: boolean;
    locationToTenantMap: boolean;
  };
  tenantMapped: boolean;
  apiReachable: boolean | null; // null = not attempted (missing prerequisites)
  apiError: string | null;      // safe, generic classification only
  checkedAt: string;
}

export async function GET() {
  const auth = await requirePermission("canManageSettings");
  if (!auth.ok) return auth.response;

  const tenantId = getTenantId(auth.session);

  const locationId = (process.env.GHL_LOCATION_ID ?? "").trim();
  const configured = {
    locationId: locationId.length > 0,
    webhookSecret: (process.env.GHL_WEBHOOK_SECRET ?? "").trim().length > 0,
    privateToken: (process.env.GHL_PRIVATE_INTEGRATION_TOKEN ?? "").trim().length > 0,
    locationToTenantMap: (process.env.GHL_LOCATION_TO_TENANT ?? "").trim().length > 0,
  };

  // Does the configured location actually resolve to THIS tenant? A map that
  // exists but points elsewhere is the silent-failure case.
  const resolved = locationId ? resolveTenantId(locationId) : undefined;
  const tenantMapped = !!resolved && resolved === tenantId;

  // Only attempt a live call when it could possibly succeed.
  let apiReachable: boolean | null = null;
  let apiError: string | null = null;

  if (configured.privateToken && configured.locationId) {
    const result = await ghlFetch<unknown>("GET", `/locations/${locationId}`);
    apiReachable = result.ok;
    if (!result.ok) {
      // Classify, never echo the raw provider error (it can contain URLs,
      // identifiers, or provider-side detail we should not surface to the UI).
      apiError =
        result.status === 401 || result.status === 403
          ? "credentials_rejected"
          : result.status === 404
            ? "location_not_found"
            : result.status === 429
              ? "rate_limited"
              : result.status === null
                ? "network_error"
                : "provider_error";
      logger.warn("[settings/ghl-status] GHL API check failed", {
        status: result.status ?? "none",
        classification: apiError,
      });
    }
  }

  const body: GhlStatusResponse = {
    configured,
    tenantMapped,
    apiReachable,
    apiError,
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json({ data: body });
}
