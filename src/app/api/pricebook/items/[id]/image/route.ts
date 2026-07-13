import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { getItemById, setItemImage } from "@/lib/db/queries/pricebook";
import { validateAndReencodeImage } from "@/lib/security/file-validation";
import {
  uploadPricebookImage,
  deletePricebookImage,
  PRICEBOOK_IMAGE_MAX_SIZE_BYTES,
} from "@/lib/storage/pricebook-images";
import { recordAuditEvent } from "@/lib/security/audit";

// ---------------------------------------------------------------------------
// POST /api/pricebook/items/[id]/image
// multipart/form-data with a `file` field. Runs the Phase 1 secure file
// pipeline: magic-byte sniff + re-encode (strips EXIF/GPS) before storage.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("canEditPricebookItems");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  // Exact tenant-scoped ownership before touching storage
  const item = await getItemById(id, tenantId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

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

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const validated = await validateAndReencodeImage(inputBuffer, {
    maxSizeBytes: PRICEBOOK_IMAGE_MAX_SIZE_BYTES,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.reason }, { status: 422 });
  }

  try {
    const url = await uploadPricebookImage(
      tenantId,
      id,
      validated.image.buffer,
      validated.image.mime,
      validated.image.ext
    );

    const result = await setItemImage(id, tenantId, url, userId);
    if (!result.ok) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "file.uploaded",
      description: `Uploaded image for pricebook item "${item.name}"`,
      entityType: "pricebook_item",
      entityId: id,
    });

    return NextResponse.json({ data: { url } });
  } catch (err) {
    console.error("[api] POST /api/pricebook/items/[id]/image:", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/pricebook/items/[id]/image
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("canEditPricebookItems");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const userId = auth.session.user.id;
  const { id } = await params;

  const item = await getItemById(id, tenantId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  try {
    await deletePricebookImage(tenantId, id);
    await setItemImage(id, tenantId, null, userId);

    await recordAuditEvent({
      tenantId,
      userId,
      actionType: "file.deleted",
      description: `Removed image from pricebook item "${item.name}"`,
      entityType: "pricebook_item",
      entityId: id,
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error("[api] DELETE /api/pricebook/items/[id]/image:", err);
    return NextResponse.json({ error: "Failed to remove image" }, { status: 500 });
  }
}
