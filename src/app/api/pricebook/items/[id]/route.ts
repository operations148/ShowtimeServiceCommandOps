import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getItemById, patchItem, archiveItem } from "@/lib/db/queries/pricebook";
import { redactItemCost } from "@/lib/pricebook/cost-visibility";
import { PatchItemSchema } from "@/lib/validation/pricebook";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { recordAuditEvent } from "@/lib/security/audit";

function canViewCosts(role: string): boolean {
  return rolePermissions[role as UserRole]?.canViewItemCosts ?? false;
}

// ---------------------------------------------------------------------------
// GET /api/pricebook/items/[id]?with_bundle=true
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("canViewPricebook");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const withBundle = new URL(request.url).searchParams.get("with_bundle") === "true";

  try {
    const item = await getItemById(id, tenantId, { withBundle });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json({
      data: redactItemCost(item, canViewCosts(auth.session.user.role)),
    });
  } catch (err) {
    console.error("[api] GET /api/pricebook/items/[id]:", err);
    return NextResponse.json({ error: "Failed to load item" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/pricebook/items/[id]
// Body must carry `version` — stale writes get 409 + currentVersion.
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

  const parsed = PatchItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  if (parsed.data.internal_cost !== undefined && !canViewCosts(auth.session.user.role)) {
    return NextResponse.json(
      { error: "Your role cannot set internal costs" },
      { status: 403 }
    );
  }

  try {
    const result = await patchItem(id, parsed.data, tenantId, userId);
    if (!result.ok) {
      if ("conflict" in result) {
        return NextResponse.json(
          {
            error: "This item was modified by someone else. Reload and try again.",
            currentVersion: result.currentVersion,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "pricebook.item_updated",
      description: `Updated pricebook item "${result.data.name}"`,
      entityType: "pricebook_item",
      entityId: id,
      metadata: {
        fields: Object.keys(parsed.data).filter((k) => k !== "version"),
      },
    });

    return NextResponse.json({
      data: redactItemCost(result.data, canViewCosts(auth.session.user.role)),
    });
  } catch (err) {
    console.error("[api] PATCH /api/pricebook/items/[id]:", err);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/pricebook/items/[id] — soft archive. Existing document line
// items keep their snapshots; the item just leaves the active catalog.
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
    const result = await archiveItem(id, tenantId, userId);
    if (!result.ok) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "pricebook.item_archived",
      description: `Archived pricebook item "${result.data.name}"`,
      entityType: "pricebook_item",
      entityId: id,
    });

    return NextResponse.json({
      data: redactItemCost(result.data, canViewCosts(auth.session.user.role)),
    });
  } catch (err) {
    console.error("[api] DELETE /api/pricebook/items/[id]:", err);
    return NextResponse.json({ error: "Failed to archive item" }, { status: 500 });
  }
}
