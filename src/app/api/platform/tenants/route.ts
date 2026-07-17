import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/api-auth";
import { isPlatformAdminEnabled } from "@/lib/platform/flags";
import { listAllTenants } from "@/lib/db/queries/platform-admin";

export const dynamic = "force-dynamic";

// GET /api/platform/tenants — cross-tenant list (aggregate metadata only).
// DOUBLE-GATED: canManageTenants (platform_owner) AND the kill-switch. The flag
// is checked first so that when disabled, this surface is indistinguishable
// from a route that doesn't exist (404), not merely forbidden.
export async function GET() {
  if (!isPlatformAdminEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const auth = await requirePermission("canManageTenants");
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json({ data: await listAllTenants() });
  } catch (err) {
    console.error("[api] GET /api/platform/tenants:", err);
    return NextResponse.json({ error: "Failed to load tenants" }, { status: 500 });
  }
}
