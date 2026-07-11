import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { patchCategory, archiveCategory } from "@/lib/db/queries/pricebook";
import { PatchCategorySchema } from "@/lib/validation/pricebook";
import { recordAuditEvent } from "@/lib/security/audit";

// ---------------------------------------------------------------------------
// PATCH /api/pricebook/categories/[id]
// Body must carry `version` (optimistic concurrency) — a stale version gets
// 409 with the current version so the client can re-fetch and re-apply.
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("canEditPricebookItems");
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

  const parsed = PatchCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  try {
    const result = await patchCategory(id, parsed.data, tenantId, userId);
    if (!result.ok) {
      if ("conflict" in result) {
        return NextResponse.json(
          {
            error: "This category was modified by someone else. Reload and try again.",
            currentVersion: result.currentVersion,
          },
          { status: 409 }
        );
      }
      if ("duplicateName" in result) {
        return NextResponse.json(
          { error: "A category with this name already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "pricebook.category_updated",
      description: `Updated pricebook category "${result.data.name}"`,
      entityType: "pricebook_category",
      entityId: id,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] PATCH /api/pricebook/categories/[id]:", err);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/pricebook/categories/[id] — soft archive, never a hard delete.
// Items keep their category_id; archived categories stay resolvable for
// historical documents.
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("canArchivePricebookItems");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  try {
    const result = await archiveCategory(id, tenantId, userId);
    if (!result.ok) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "pricebook.category_archived",
      description: `Archived pricebook category "${result.data.name}"`,
      entityType: "pricebook_category",
      entityId: id,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] DELETE /api/pricebook/categories/[id]:", err);
    return NextResponse.json({ error: "Failed to archive category" }, { status: 500 });
  }
}
