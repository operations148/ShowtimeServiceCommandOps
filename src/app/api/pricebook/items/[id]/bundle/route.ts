import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getBundleChildren, setBundleChildren, getItemById } from "@/lib/db/queries/pricebook";
import { SetBundleChildrenSchema } from "@/lib/validation/pricebook";
import { recordAuditEvent } from "@/lib/security/audit";

// ---------------------------------------------------------------------------
// GET /api/pricebook/items/[id]/bundle — a bundle's composition.
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("canViewPricebook");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const item = await getItemById(id, tenantId);
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const children = await getBundleChildren(id, tenantId);
    return NextResponse.json({ data: children });
  } catch (err) {
    console.error("[api] GET /api/pricebook/items/[id]/bundle:", err);
    return NextResponse.json({ error: "Failed to load bundle" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/pricebook/items/[id]/bundle — replace the composition.
// Children must belong to this tenant, cannot be bundles themselves (no
// nesting), and the write is gated on the bundle's version (409 on stale).
// ---------------------------------------------------------------------------

export async function PUT(
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

  const parsed = SetBundleChildrenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  try {
    const result = await setBundleChildren(id, parsed.data, tenantId, userId);
    if (!result.ok) {
      if ("conflict" in result) {
        return NextResponse.json(
          {
            error: "This bundle was modified by someone else. Reload and try again.",
            currentVersion: result.currentVersion,
          },
          { status: 409 }
        );
      }
      if ("notABundle" in result) {
        return NextResponse.json(
          { error: "This item is not a bundle" },
          { status: 422 }
        );
      }
      if ("invalidChildren" in result) {
        return NextResponse.json(
          {
            error:
              "One or more child items were not found for this tenant, or are bundles themselves (nesting is not allowed)",
            invalidChildren: result.invalidChildren,
          },
          { status: 422 }
        );
      }
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "pricebook.bundle_updated",
      description: `Updated bundle composition (${result.data.length} items)`,
      entityType: "pricebook_item",
      entityId: id,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] PUT /api/pricebook/items/[id]/bundle:", err);
    return NextResponse.json({ error: "Failed to update bundle" }, { status: 500 });
  }
}
