import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { listWorkOrderAttachments, createWorkOrderAttachment } from "@/lib/db/queries/work-order-attachments";
import { validateAttachment } from "@/lib/security/file-validation";
import { uploadWorkOrderAttachment, ATTACHMENT_MAX_SIZE_BYTES } from "@/lib/storage/work-order-attachments";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { recordAuditEvent } from "@/lib/security/audit";

// GET /api/work-orders/[id]/attachments
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canViewAllWorkOrders");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  try {
    return NextResponse.json({ data: await listWorkOrderAttachments(id, tenantId) });
  } catch (err) {
    console.error("[api] GET /api/work-orders/[id]/attachments:", err);
    return NextResponse.json({ error: "Failed to load attachments" }, { status: 500 });
  }
}

// POST /api/work-orders/[id]/attachments — multipart/form-data with a `file`
// field and an optional `is_customer_visible` field. Runs the secure file
// pipeline (magic-byte sniff; PDFs/images only).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("canManageWorkOrderAttachments");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  const limit = await checkRateLimit(`${tenantId}:${userId}`, "fileUpload");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many uploads. Please slow down." }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 422 });
  }
  const isCustomerVisible = formData.get("is_customer_visible") === "true";
  const originalName = file instanceof File ? file.name : "attachment";

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const validated = await validateAttachment(inputBuffer, { maxSizeBytes: ATTACHMENT_MAX_SIZE_BYTES });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.reason }, { status: 422 });
  }

  try {
    const { path } = await uploadWorkOrderAttachment(tenantId, id, validated.file.buffer, validated.file.mime, validated.file.ext, originalName);
    const attachment = await createWorkOrderAttachment(id, tenantId, {
      filePath: path,
      fileName: originalName,
      mimeType: validated.file.mime,
      fileSizeBytes: validated.file.buffer.length,
      isCustomerVisible,
      source: "manual",
      uploadedBy: userId,
    });

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "work_order_attachment.uploaded",
      description: `Uploaded attachment "${originalName}" to work order ${id}`,
      entityType: "work_order_attachment",
      entityId: attachment.id,
    });

    return NextResponse.json({ data: attachment }, { status: 201 });
  } catch (err) {
    console.error("[api] POST /api/work-orders/[id]/attachments:", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
