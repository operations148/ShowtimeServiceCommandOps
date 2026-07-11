import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { revokeEstimateToken } from "@/lib/estimates/send";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/estimates/[id]/revoke-token — kill the public link without changing
// the estimate's decision state.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageEstimates");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  try {
    const result = await revokeEstimateToken(id, tenantId, { userId, name: (auth.session.user as { name?: string }).name });
    if (!result.ok) {
      return NextResponse.json({ error: "No active public link to revoke" }, { status: 404 });
    }
    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "estimate.token_revoked",
      description: `Revoked public link for estimate ${id}`,
      entityType: "estimate",
      entityId: id,
    });
    return NextResponse.json({ data: { revoked: true } });
  } catch (err) {
    console.error("[api] POST /api/estimates/[id]/revoke-token:", err);
    return NextResponse.json({ error: "Failed to revoke link" }, { status: 500 });
  }
}
