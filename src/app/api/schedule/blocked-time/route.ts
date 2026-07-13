import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listBlockedTime, createBlockedTime } from "@/lib/db/queries/blocked-time";
import { CreateBlockedTimeSchema } from "@/lib/validation/scheduling";

// GET /api/schedule/blocked-time?from=<iso>&to=<iso>&technician_id=
export async function GET(request: NextRequest) {
  const auth = await requirePermission("canViewSchedule");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { searchParams } = new URL(request.url);
  const fromUtc = searchParams.get("from");
  const toUtc = searchParams.get("to");
  if (!fromUtc || !toUtc) {
    return NextResponse.json({ error: "from and to (ISO datetimes) are required" }, { status: 422 });
  }

  try {
    const rows = await listBlockedTime(tenantId, {
      fromUtc,
      toUtc,
      technicianId: searchParams.get("technician_id") ?? undefined,
    });
    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("[api] GET /api/schedule/blocked-time:", err);
    return NextResponse.json({ error: "Failed to load blocked time" }, { status: 500 });
  }
}

// POST /api/schedule/blocked-time
export async function POST(request: NextRequest) {
  const auth = await requirePermission("canManageSchedule");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateBlockedTimeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await createBlockedTime(parsed.data, tenantId, userId);
    if (!result.ok) {
      return NextResponse.json({ error: "technician_id not found for this tenant" }, { status: 422 });
    }
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/schedule/blocked-time:", err);
    return NextResponse.json({ error: "Failed to create blocked time" }, { status: 500 });
  }
}
