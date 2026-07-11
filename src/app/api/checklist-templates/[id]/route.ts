import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getChecklistTemplateWithItems, patchChecklistTemplate, archiveChecklistTemplate } from "@/lib/db/queries/checklist-templates";
import { PatchChecklistTemplateSchema } from "@/lib/validation/checklist-template";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/checklist-templates/[id]
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewAllWorkOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    const template = await getChecklistTemplateWithItems(id, tenantId);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    return NextResponse.json({ data: template });
  } catch (err) {
    console.error("[api] GET /api/checklist-templates/[id]:", err);
    return NextResponse.json({ error: "Failed to load template" }, { status: 500 });
  }
}

// PATCH /api/checklist-templates/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageChecklistTemplates");
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

  const parsed = PatchChecklistTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await patchChecklistTemplate(id, parsed.data, tenantId, userId);
    if (!result.ok) {
      if ("conflict" in result) return NextResponse.json({ error: "This template was modified by someone else. Reload and try again.", currentVersion: result.currentVersion }, { status: 409 });
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "checklist_template.updated",
      description: `Updated checklist template "${result.data.name}"`,
      entityType: "checklist_template",
      entityId: id,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] PATCH /api/checklist-templates/[id]:", err);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

// DELETE /api/checklist-templates/[id] — soft archive.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageChecklistTemplates");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  try {
    const result = await archiveChecklistTemplate(id, tenantId, userId);
    if (!result.ok) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "checklist_template.archived",
      description: `Archived checklist template "${result.data.name}"`,
      entityType: "checklist_template",
      entityId: id,
    });

    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] DELETE /api/checklist-templates/[id]:", err);
    return NextResponse.json({ error: "Failed to archive template" }, { status: 500 });
  }
}
