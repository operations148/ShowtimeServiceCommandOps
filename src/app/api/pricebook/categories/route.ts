import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listCategories, createCategory } from "@/lib/db/queries/pricebook";
import { CreateCategorySchema } from "@/lib/validation/pricebook";
import { recordAuditEvent } from "@/lib/security/audit";

// ---------------------------------------------------------------------------
// GET /api/pricebook/categories?include_archived=true
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requirePermission("canViewPricebook");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const includeArchived =
    new URL(request.url).searchParams.get("include_archived") === "true";

  try {
    const categories = await listCategories(tenantId, { includeArchived });
    return NextResponse.json({ data: categories });
  } catch (err) {
    console.error("[api] GET /api/pricebook/categories:", err);
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/pricebook/categories
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requirePermission("canCreatePricebookItems");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  try {
    const result = await createCategory(parsed.data, tenantId, userId);
    if (!result.ok) {
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
      actionType: "pricebook.category_created",
      description: `Created pricebook category "${result.data.name}"`,
      entityType: "pricebook_category",
      entityId: result.data.id,
    });

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/pricebook/categories:", err);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
