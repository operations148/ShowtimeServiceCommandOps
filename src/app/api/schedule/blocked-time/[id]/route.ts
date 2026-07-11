import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { deleteBlockedTime } from "@/lib/db/queries/blocked-time";

// DELETE /api/schedule/blocked-time/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageSchedule");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  try {
    const result = await deleteBlockedTime(id, tenantId, userId);
    if (!result.ok) return NextResponse.json({ error: "Blocked time not found" }, { status: 404 });
    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    console.error("[api] DELETE /api/schedule/blocked-time/[id]:", err);
    return NextResponse.json({ error: "Failed to delete blocked time" }, { status: 500 });
  }
}
