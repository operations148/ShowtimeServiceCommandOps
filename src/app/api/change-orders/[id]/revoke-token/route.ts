import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { revokeChangeOrderToken } from "@/lib/change-orders/send";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/change-orders/[id]/revoke-token
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageChangeOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  try {
    const result = await revokeChangeOrderToken(id, tenantId, { userId, name: (auth.session.user as { name?: string }).name });
    if (!result.ok) return NextResponse.json({ error: "No active public link to revoke" }, { status: 404 });

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "change_order.token_revoked",
      description: `Revoked public link for change order ${id}`,
      entityType: "change_order",
      entityId: id,
    });
    return NextResponse.json({ data: { revoked: true } });
  } catch (err) {
    console.error("[api] POST /api/change-orders/[id]/revoke-token:", err);
    return NextResponse.json({ error: "Failed to revoke link" }, { status: 500 });
  }
}
