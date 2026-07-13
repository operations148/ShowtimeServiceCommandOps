import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getEstimateById, patchEstimate } from "@/lib/db/queries/estimates";
import { PatchEstimateSchema } from "@/lib/validation/estimate";
import { redactEstimateCosts } from "@/lib/estimates/redact-costs";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { recordAuditEvent } from "@/lib/security/audit";

function canViewCosts(role: string): boolean {
  return rolePermissions[role as UserRole]?.canViewItemCosts ?? false;
}

// GET /api/estimates/[id]
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewEstimates");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const estimate = await getEstimateById(id, tenantId, { withLines: true });
    if (!estimate) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    return NextResponse.json({ data: redactEstimateCosts(estimate, canViewCosts(auth.session.user.role)) });
  } catch (err) {
    console.error("[api] GET /api/estimates/[id]:", err);
    return NextResponse.json({ error: "Failed to load estimate" }, { status: 500 });
  }
}

// PATCH /api/estimates/[id] — draft/ready edits only; requires version
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = PatchEstimateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await patchEstimate(id, parsed.data, tenantId, userId);
    if (!result.ok) {
      if ("badItemId" in result) {
        return NextResponse.json({ error: "A referenced pricebook item was not found for this tenant", badItemId: result.badItemId }, { status: 422 });
      }
      if ("conflict" in result) {
        return NextResponse.json({ error: "This estimate was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      }
      if ("notEditable" in result) {
        return NextResponse.json({ error: `An estimate in status '${result.status}' cannot be edited` }, { status: 409 });
      }
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "estimate.updated",
      description: `Updated estimate ${result.data.estimate_number}`,
      entityType: "estimate",
      entityId: id,
    });

    return NextResponse.json({ data: redactEstimateCosts(result.data, canViewCosts(auth.session.user.role)) });
  } catch (err) {
    console.error("[api] PATCH /api/estimates/[id]:", err);
    return NextResponse.json({ error: "Failed to update estimate" }, { status: 500 });
  }
}
