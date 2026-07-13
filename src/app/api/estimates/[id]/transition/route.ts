import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { transitionEstimate } from "@/lib/db/queries/estimates";
import { EstimateTransitionSchema } from "@/lib/validation/estimate";
import { EstimateStatus } from "@/types/estimate";
import { recordAuditEvent } from "@/lib/security/audit";
import type { RolePermissions } from "@/config/roles";

// POST /api/estimates/[id]/transition — draft/ready/voided (send has its own route)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Base gate is manage; voiding additionally requires canVoidEstimates.
  const auth = await requirePermission("canManageEstimates");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = EstimateTransitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const to = parsed.data.to as EstimateStatus;
  if (to === EstimateStatus.VOIDED) {
    const perms = (auth.session.user as { role: string }).role;
    // Re-check void permission explicitly (server-side, not UI).
    const { rolePermissions } = await import("@/config/roles");
    const allowed = (rolePermissions[perms as keyof typeof rolePermissions] as RolePermissions | undefined)?.canVoidEstimates ?? false;
    if (!allowed) {
      return NextResponse.json({ error: "Your role cannot void estimates" }, { status: 403 });
    }
  }

  try {
    const result = await transitionEstimate(id, to, parsed.data.version, tenantId, userId);
    if (!result.ok) {
      if ("conflict" in result) {
        return NextResponse.json({ error: "This estimate was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      }
      if ("invalidTransition" in result) {
        return NextResponse.json({ error: `Cannot move an estimate from '${result.from}' to '${result.to}'` }, { status: 409 });
      }
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: to === EstimateStatus.VOIDED ? "estimate.voided" : "estimate.updated",
      description: `Estimate ${result.data.estimate_number} → ${to}`,
      entityType: "estimate",
      entityId: id,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] POST /api/estimates/[id]/transition:", err);
    return NextResponse.json({ error: "Failed to update estimate status" }, { status: 500 });
  }
}
