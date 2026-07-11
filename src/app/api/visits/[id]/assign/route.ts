import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { assignVisit } from "@/lib/db/queries/schedule";
import { AssignVisitSchema } from "@/lib/validation/scheduling";
import { recordAuditEvent } from "@/lib/security/audit";

// POST /api/visits/[id]/assign — multi-technician assignment. Requires
// canAssignTechnicians (existing dispatch permission).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canAssignTechnicians");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AssignVisitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await assignVisit(id, parsed.data, tenantId, userId);
    if (!result.ok) {
      if ("conflict" in result) {
        return NextResponse.json({ error: "This visit was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      }
      if ("invalidTechnician" in result) {
        return NextResponse.json({ error: "One or more technicians are not valid for this tenant", invalidTechnician: result.invalidTechnician }, { status: 422 });
      }
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: parsed.data.lead_technician_id ? "visit.assigned" : "visit.reassigned",
      description: `Assigned visit ${id}`,
      entityType: "visit",
      entityId: id,
      metadata: { lead: parsed.data.lead_technician_id, assistants: parsed.data.assistant_technician_ids },
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] POST /api/visits/[id]/assign:", err);
    return NextResponse.json({ error: "Failed to assign visit" }, { status: 500 });
  }
}
