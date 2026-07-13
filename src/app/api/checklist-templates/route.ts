import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listChecklistTemplates, createChecklistTemplate } from "@/lib/db/queries/checklist-templates";
import { CreateChecklistTemplateSchema } from "@/lib/validation/checklist-template";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/checklist-templates
export async function GET(_request: NextRequest) {
  const auth = await requirePermission("canViewAllWorkOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  try {
    return NextResponse.json({ data: await listChecklistTemplates(tenantId) });
  } catch (err) {
    console.error("[api] GET /api/checklist-templates:", err);
    return NextResponse.json({ error: "Failed to load checklist templates" }, { status: 500 });
  }
}

// POST /api/checklist-templates
export async function POST(request: NextRequest) {
  const auth = await requirePermission("canManageChecklistTemplates");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateChecklistTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await createChecklistTemplate(parsed.data, tenantId, userId);
    if (!result.ok) {
      if ("duplicateCategory" in result) return NextResponse.json({ error: "A template already exists for this service category" }, { status: 409 });
      return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "checklist_template.created",
      description: `Created checklist template "${result.data.name}" for ${result.data.service_category}`,
      entityType: "checklist_template",
      entityId: result.data.id,
    });

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/checklist-templates:", err);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
