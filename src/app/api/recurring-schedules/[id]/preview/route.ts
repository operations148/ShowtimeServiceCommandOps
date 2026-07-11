import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { previewSchedule } from "@/lib/db/queries/recurring-control";
import { getTenantTimezone } from "@/lib/db/queries/tenant-settings";
import { RecurringPreviewQuerySchema } from "@/lib/validation/scheduling";

// GET /api/recurring-schedules/[id]/preview?weeks=4 — manual, no writes.
// Shows the occurrence dates the cron WOULD generate (minus exceptions/pause).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewSchedule");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const parsed = RecurringPreviewQuerySchema.safeParse({
    weeks: new URL(request.url).searchParams.get("weeks") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const timeZone = await getTenantTimezone(tenantId);
    const result = await previewSchedule(id, tenantId, parsed.data.weeks, timeZone);
    if (!result) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[api] GET /api/recurring-schedules/[id]/preview:", err);
    return NextResponse.json({ error: "Failed to preview schedule" }, { status: 500 });
  }
}
