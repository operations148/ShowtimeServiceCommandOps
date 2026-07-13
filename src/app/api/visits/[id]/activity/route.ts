import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth, getTenantId, isTechnicianScoped } from "@/lib/auth/api-auth";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { getScheduleEventsForVisit, getVisitWithSchedule } from "@/lib/db/queries/schedule";

// GET /api/visits/[id]/activity — schedule/assignment audit history for a visit.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const role = auth.session.user.role as UserRole;
  const { id } = await params;

  // Technicians can view activity only for their own visits.
  if (isTechnicianScoped(auth.session)) {
    const visit = await getVisitWithSchedule(id, tenantId);
    if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    const mine = visit.technician_id === auth.session.user.id || (visit.assignments ?? []).some((a) => a.technician_id === auth.session.user.id);
    if (!mine) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  } else if (!(rolePermissions[role]?.canViewSchedule ?? false)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const events = await getScheduleEventsForVisit(id, tenantId);
    return NextResponse.json({ data: events });
  } catch (err) {
    console.error("[api] GET /api/visits/[id]/activity:", err);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
