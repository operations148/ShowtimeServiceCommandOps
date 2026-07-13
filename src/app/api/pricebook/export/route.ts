import { NextResponse, type NextRequest } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listItems, listCategories } from "@/lib/db/queries/pricebook";
import { pricebookToCsv } from "@/lib/pricebook/export-csv";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { recordAuditEvent } from "@/lib/security/audit";

// ---------------------------------------------------------------------------
// GET /api/pricebook/export — CSV download.
// Gated on canExportPricebook; internal costs are included only when the
// role ALSO holds canViewItemCosts (export permission alone never implies
// cost visibility). Formula-injection-safe (see export-csv.ts).
// Import is deliberately not implemented in Phase 2 — see ADR-0006.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requirePermission("canExportPricebook");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  const includeArchived =
    new URL(request.url).searchParams.get("include_archived") === "true";
  const includeCosts =
    rolePermissions[auth.session.user.role as UserRole]?.canViewItemCosts ?? false;

  try {
    const [items, categories] = await Promise.all([
      listItems(tenantId, {
        q: undefined,
        category_id: undefined,
        active: undefined,
        include_archived: includeArchived,
      }),
      listCategories(tenantId, { includeArchived: true }),
    ]);

    const csv = pricebookToCsv(items, categories, includeCosts);

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "pricebook.exported",
      description: `Exported pricebook CSV (${items.length} items, costs ${includeCosts ? "included" : "excluded"})`,
      metadata: { itemCount: items.length, includeCosts, includeArchived },
    });

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pricebook-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api] GET /api/pricebook/export:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
