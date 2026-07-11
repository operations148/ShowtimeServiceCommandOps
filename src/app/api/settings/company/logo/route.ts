import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/client";
import { validateAndReencodeImage } from "@/lib/security/file-validation";

const LOGO_BUCKET = "logos";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

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

  // Magic-byte sniff + re-encode. SVG is deliberately no longer accepted here
  // (security-audit M5) — it was previously whitelisted into a public bucket
  // with no CSP and no sanitizer, and SVG can carry an embedded <script>.
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const validated = await validateAndReencodeImage(inputBuffer, { maxSizeBytes: MAX_SIZE_BYTES });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.reason }, { status: 422 });
  }

  const path = `${tenantId}/${Date.now()}.${validated.image.ext}`;

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
    .upload(path, validated.image.buffer, { upsert: true, contentType: validated.image.mime });

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
