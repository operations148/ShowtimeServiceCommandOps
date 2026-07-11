import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { restoreCategory } from "@/lib/db/queries/pricebook";
import { recordAuditEvent } from "@/lib/security/audit";

// ---------------------------------------------------------------------------
// POST /api/pricebook/categories/[id]/restore — undo a soft archive.
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
    const result = await restoreCategory(id, tenantId, userId);
    if (!result.ok) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "pricebook.category_restored",
      description: `Restored pricebook category "${result.data.name}"`,
      entityType: "pricebook_category",
      entityId: id,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] POST /api/pricebook/categories/[id]/restore:", err);
    return NextResponse.json({ error: "Failed to restore category" }, { status: 500 });
  }
}
