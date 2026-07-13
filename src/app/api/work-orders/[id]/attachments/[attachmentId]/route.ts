import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getWorkOrderAttachment, setAttachmentVisibility, deleteWorkOrderAttachmentRow } from "@/lib/db/queries/work-order-attachments";
import { deleteWorkOrderAttachment as deleteFromStorage } from "@/lib/storage/work-order-attachments";
import { PatchWorkOrderAttachmentSchema } from "@/lib/validation/work-order-project";
import { recordAuditEvent } from "@/lib/security/audit";

// PATCH /api/work-orders/[id]/attachments/[attachmentId] — toggle customer visibility.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const auth = await requirePermission("canManageWorkOrderAttachments");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { attachmentId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchWorkOrderAttachmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await setAttachmentVisibility(attachmentId, tenantId, parsed.data.is_customer_visible);
    if (!result.ok) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[api] PATCH .../attachments/[attachmentId]:", err);
    return NextResponse.json({ error: "Failed to update attachment" }, { status: 500 });
  }
}

// DELETE /api/work-orders/[id]/attachments/[attachmentId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const auth = await requirePermission("canManageWorkOrderAttachments");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { attachmentId } = await params;

  try {
    const existing = await getWorkOrderAttachment(attachmentId, tenantId);
    if (!existing) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

    await deleteWorkOrderAttachmentRow(attachmentId, tenantId);
    await deleteFromStorage(existing.file_path).catch((err) => console.error("[storage] attachment delete:", err));

    await recordAuditEvent({
      tenantId,
      userId: auth.session.user.id,
      actionType: "work_order_attachment.deleted",
      description: `Deleted attachment "${existing.file_name}"`,
      entityType: "work_order_attachment",
      entityId: attachmentId,
    });

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    console.error("[api] DELETE .../attachments/[attachmentId]:", err);
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
