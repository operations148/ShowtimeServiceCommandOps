import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/api-auth";
import { isPlatformAdminEnabled } from "@/lib/platform/flags";
import { setTenantActive } from "@/lib/db/queries/platform-admin";
import { recordAuditEvent } from "@/lib/security/audit";

type RouteContext = { params: Promise<{ id: string }> };

const PatchSchema = z.object({ is_active: z.boolean() });

// PATCH /api/platform/tenants/[id] — activate / suspend a tenant. Double-gated
// (kill-switch + canManageTenants) and audited: suspending a whole tenant is
// among the most consequential actions in the system.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!isPlatformAdminEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const auth = await requirePermission("canManageTenants");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const actorTenant = auth.session.user.tenant_id;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "is_active (boolean) required" }, { status: 422 });
  }

  // A platform owner suspending their OWN tenant would lock themselves out —
  // block it rather than let them foot-gun.
  if (id === actorTenant && parsed.data.is_active === false) {
    return NextResponse.json({ error: "You can't suspend your own tenant" }, { status: 409 });
  }

  try {
    const result = await setTenantActive(id, parsed.data.is_active);
    if (!result) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    await recordAuditEvent({
      tenantId: actorTenant,
      userId: auth.session.user.id,
      actionType: parsed.data.is_active ? "platform.tenant_activated" : "platform.tenant_suspended",
      description: `${parsed.data.is_active ? "Activated" : "Suspended"} tenant ${result.name} (${id})`,
      entityType: "tenant",
      entityId: id,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[api] PATCH /api/platform/tenants/[id]:", err);
    return NextResponse.json({ error: "Failed to update tenant" }, { status: 500 });
  }
}
