import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth, getTenantId, isTechnicianScoped } from "@/lib/auth/api-auth";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { getScheduleFeed } from "@/lib/db/queries/schedule";
import { getTenantTimezone } from "@/lib/db/queries/tenant-settings";
import { ScheduleFeedQuerySchema } from "@/lib/validation/scheduling";
import { localToday } from "@/lib/scheduling/timezone";

export const dynamic = "force-dynamic";

// GET /api/schedule?from=&to=&technician_id=&scope=
// Calendar feed. Technicians see only their own visits; other roles need
// canViewSchedule.
export async function GET(request: NextRequest) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const role = auth.session.user.role as UserRole;
  const scoped = isTechnicianScoped(auth.session);

  if (!scoped && !(rolePermissions[role]?.canViewSchedule ?? false)) {
    return NextResponse.json({ error: "Forbidden — your role cannot view the schedule" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = ScheduleFeedQuerySchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    technician_id: searchParams.get("technician_id") ?? undefined,
    scope: searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const timeZone = await getTenantTimezone(tenantId);
    const feed = await getScheduleFeed(tenantId, {
      from: parsed.data.from,
      to: parsed.data.to,
      technicianId: parsed.data.technician_id,
      scope: parsed.data.scope,
      todayLocal: localToday(timeZone),
      // Technician role → restrict to their own visits, ignoring any technician_id filter.
      restrictToTechnicianUserId: scoped ? auth.session.user.id : undefined,
    });
    return NextResponse.json({ data: feed, timezone: timeZone });
  } catch (err) {
    console.error("[api] GET /api/schedule:", err);
    return NextResponse.json({ error: "Failed to load schedule" }, { status: 500 });
  }
}
