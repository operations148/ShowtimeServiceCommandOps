import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/client";

const LOGO_BUCKET = "logos";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

// ---------------------------------------------------------------------------
// POST /api/settings/company/logo
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requirePermission("canManageSettings");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

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

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Use JPEG, PNG, WebP, or SVG." }, { status: 422 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large. Maximum size is 5 MB." }, { status: 422 });
  }

  const filename = file instanceof File ? file.name : `logo-${Date.now()}.png`;
  const ext = filename.split(".").pop() ?? "png";
  const path = `${tenantId}/${Date.now()}.${ext}`;

  // Remove existing logos for this tenant
  const { data: existing } = await db.storage.from(LOGO_BUCKET).list(tenantId);
  if (existing?.length) {
    await db.storage
      .from(LOGO_BUCKET)
      .remove(existing.map((f) => `${tenantId}/${f.name}`))
      .catch(() => null);
  }

  const { error: uploadError } = await db.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error("[api] POST /api/settings/company/logo upload:", uploadError);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  const { data: urlData } = db.storage.from(LOGO_BUCKET).getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error: dbError } = await db
    .from("tenants")
    .update({ logo_url: publicUrl })
    .eq("id", tenantId);

  if (dbError) {
    console.error("[api] POST /api/settings/company/logo db:", dbError);
    return NextResponse.json({ error: "Failed to save logo" }, { status: 500 });
  }

  return NextResponse.json({ data: { url: publicUrl } });
}

// ---------------------------------------------------------------------------
// DELETE /api/settings/company/logo
// ---------------------------------------------------------------------------

export async function DELETE(_request: NextRequest) {
  const auth = await requirePermission("canManageSettings");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { data: existing } = await db.storage.from(LOGO_BUCKET).list(tenantId);
  if (existing?.length) {
    await db.storage.from(LOGO_BUCKET).remove(existing.map((f) => `${tenantId}/${f.name}`));
  }

  await db.from("tenants").update({ logo_url: null }).eq("id", tenantId);

  return NextResponse.json({ data: { success: true } });
}
