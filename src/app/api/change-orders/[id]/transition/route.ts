import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { voidChangeOrder } from "@/lib/db/queries/change-orders";
import { ChangeOrderTransitionSchema } from "@/lib/validation/change-order";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/change-orders/[id]/transition — currently only "voided" is a
// direct staff transition (draft->sent is via /send; accept/reject are
// public-token or override-only).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canVoidChangeOrders");
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

  const parsed = ChangeOrderTransitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  if (parsed.data.to !== "voided") {
    return NextResponse.json({ error: "Only 'voided' is a direct transition from this endpoint" }, { status: 422 });
  }

  try {
    const result = await voidChangeOrder(id, parsed.data.version, tenantId, userId);
    if (!result.ok) {
      if ("conflict" in result) return NextResponse.json({ error: "This change order was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      if ("invalidTransition" in result) return NextResponse.json({ error: `Cannot void a change order in status '${result.from}'` }, { status: 409 });
      return NextResponse.json({ error: "Change order not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "change_order.voided",
      description: `Voided change order ${result.data.change_order_number}`,
      entityType: "change_order",
      entityId: id,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] POST /api/change-orders/[id]/transition:", err);
    return NextResponse.json({ error: "Failed to update change order status" }, { status: 500 });
  }
}
