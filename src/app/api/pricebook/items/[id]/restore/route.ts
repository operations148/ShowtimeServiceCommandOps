import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { restoreItem } from "@/lib/db/queries/pricebook";
import { redactItemCost } from "@/lib/pricebook/cost-visibility";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { recordAuditEvent } from "@/lib/security/audit";

// ---------------------------------------------------------------------------
// POST /api/pricebook/items/[id]/restore — undo a soft archive.
// ---------------------------------------------------------------------------

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("canArchivePricebookItems");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  try {
    const result = await restoreItem(id, tenantId, userId);
    if (!result.ok) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "pricebook.item_restored",
      description: `Restored pricebook item "${result.data.name}"`,
      entityType: "pricebook_item",
      entityId: id,
    });

    const canViewCosts =
      rolePermissions[auth.session.user.role as UserRole]?.canViewItemCosts ?? false;
    return NextResponse.json({ data: redactItemCost(result.data, canViewCosts) });
  } catch (err) {
    console.error("[api] POST /api/pricebook/items/[id]/restore:", err);
    return NextResponse.json({ error: "Failed to restore item" }, { status: 500 });
  }
}
