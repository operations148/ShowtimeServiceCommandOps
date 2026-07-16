import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listReconciliationFindings } from "@/lib/db/queries/reconciliation";

// GET /api/reconciliation/findings?status=open
export async function GET(request: NextRequest) {
  const auth = await requirePermission("canViewFinancialReports");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const status = request.nextUrl.searchParams.get("status");
  const validStatus = status === "open" || status === "resolved" || status === "ignored" ? status : undefined;

  try {
    return NextResponse.json({ data: await listReconciliationFindings(tenantId, { status: validStatus }) });
  } catch (err) {
    console.error("[api] GET /api/reconciliation/findings:", err);
    return NextResponse.json({ error: "Failed to load findings" }, { status: 500 });
  }
}
