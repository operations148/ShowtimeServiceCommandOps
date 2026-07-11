import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { overrideChangeOrderLock } from "@/lib/change-orders/override";
import { ChangeOrderOverrideSchema } from "@/lib/validation/change-order";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/change-orders/[id]/override — re-open a locked change order.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canOverrideChangeOrderLock");
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

  const parsed = ChangeOrderOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A reason is required to override a change order lock", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await overrideChangeOrderLock(id, tenantId, parsed.data.reason, { userId, name: (auth.session.user as { name?: string }).name });
    if (!result.ok) {
      if (result.reason === "not_overridable") return NextResponse.json({ error: `A change order in status '${result.status}' cannot be overridden` }, { status: 409 });
      return NextResponse.json({ error: "Change order not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "change_order.override",
      description: `Overrode change order lock ${id}`,
      entityType: "change_order",
      entityId: id,
      metadata: { reason: parsed.data.reason },
    });

    return NextResponse.json({ data: { newVersion: result.newVersion } });
  } catch (err) {
    console.error("[api] POST /api/change-orders/[id]/override:", err);
    return NextResponse.json({ error: "Failed to override change order" }, { status: 500 });
  }
}
