import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth, getTenantId, isTechnicianScoped } from "@/lib/auth/api-auth";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { getVisitWithSchedule } from "@/lib/db/queries/schedule";

// GET /api/visits/[id]/detail — rich visit (schedule fields + assignments +
// joined property/work-order) for the admin visit detail view.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const role = auth.session.user.role as UserRole;
  const { id } = await params;

  try {
    const visit = await getVisitWithSchedule(id, tenantId);
    if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

    if (isTechnicianScoped(auth.session)) {
      const mine = visit.technician_id === auth.session.user.id || (visit.assignments ?? []).some((a) => a.technician_id === auth.session.user.id);
      if (!mine) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    } else if (!(rolePermissions[role]?.canViewSchedule ?? false)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ data: visit });
  } catch (err) {
    console.error("[api] GET /api/visits/[id]/detail:", err);
    return NextResponse.json({ error: "Failed to load visit" }, { status: 500 });
  }
}
