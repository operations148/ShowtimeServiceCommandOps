import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getFinancialReport } from "@/lib/db/queries/financial-reports";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// GET /api/reports/financial?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Revenue (invoiced / collected / outstanding / written-off), job cost, gross
// profit + margin, and AR aging for a tenant over a period. Gated on
// canViewFinancialReports — the SAME rail that already governs cost/margin
// visibility (owners + read-only owner; office staff and technicians excluded),
// so this doesn't open a new hole (ADR-0016 §3 line).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const auth = await requirePermission("canViewFinancialReports");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { searchParams } = request.nextUrl;
  const to = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  // Default window: the trailing 30 days ending today.
  const from = searchParams.get("from") ??
    new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD" }, { status: 422 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from must not be after to" }, { status: 422 });
  }

  try {
    return NextResponse.json({ data: await getFinancialReport(tenantId, from, to) });
  } catch (err) {
    console.error("[api] GET /api/reports/financial:", err);
    return NextResponse.json({ error: "Failed to build financial report" }, { status: 500 });
  }
}
