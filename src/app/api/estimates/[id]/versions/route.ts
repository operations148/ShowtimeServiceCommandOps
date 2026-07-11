import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getEstimateVersions } from "@/lib/db/queries/estimates";

// GET /api/estimates/[id]/versions — immutable version history (metadata only;
// full snapshots are large, returned but read-only).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewEstimates");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const versions = await getEstimateVersions(id, tenantId);
    return NextResponse.json({ data: versions });
  } catch (err) {
    console.error("[api] GET /api/estimates/[id]/versions:", err);
    return NextResponse.json({ error: "Failed to load version history" }, { status: 500 });
  }
}
