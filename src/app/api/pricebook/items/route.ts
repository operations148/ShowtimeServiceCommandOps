import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listItems, createItem } from "@/lib/db/queries/pricebook";
import { redactItemCost, redactItemCosts } from "@/lib/pricebook/cost-visibility";
import { CreateItemSchema, ListItemsQuerySchema } from "@/lib/validation/pricebook";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { recordAuditEvent } from "@/lib/security/audit";

function canViewCosts(role: string): boolean {
  return rolePermissions[role as UserRole]?.canViewItemCosts ?? false;
}

// ---------------------------------------------------------------------------
// GET /api/pricebook/items?q=&item_type=&category_id=&include_archived=&active=
// internal_cost is stripped server-side unless the role holds canViewItemCosts.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requirePermission("canViewPricebook");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { searchParams } = new URL(request.url);
  const parsed = ListItemsQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    item_type: searchParams.get("item_type") ?? undefined,
    category_id: searchParams.get("category_id") ?? undefined,
    include_archived: searchParams.get("include_archived") ?? undefined,
    active: searchParams.get("active") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  try {
    const items = await listItems(tenantId, parsed.data);
    return NextResponse.json({
      data: redactItemCosts(items, canViewCosts(auth.session.user.role)),
    });
  } catch (err) {
    console.error("[api] GET /api/pricebook/items:", err);
    return NextResponse.json({ error: "Failed to load pricebook items" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/pricebook/items
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

  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  // A role that cannot view costs cannot set one either (it couldn't verify
  // what it wrote). Reject explicitly instead of silently zeroing.
  if (parsed.data.internal_cost !== 0 && !canViewCosts(auth.session.user.role)) {
    return NextResponse.json(
      { error: "Your role cannot set internal costs" },
      { status: 403 }
    );
  }

  try {
    const result = await createItem(parsed.data, tenantId, userId);
    if (!result.ok) {
      return NextResponse.json(
        { error: "category_id not found for this tenant" },
        { status: 422 }
      );
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "pricebook.item_created",
      description: `Created pricebook item "${result.data.name}" (${result.data.item_type})`,
      entityType: "pricebook_item",
      entityId: result.data.id,
    });

    return NextResponse.json(
      { data: redactItemCost(result.data, canViewCosts(auth.session.user.role)) },
      { status: 201 }
    );
  } catch (err) {
    console.error("[api] POST /api/pricebook/items:", err);
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}
