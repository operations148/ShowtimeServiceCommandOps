import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth, isTechnicianScoped, getTenantId } from "@/lib/auth/api-auth";
import { getVisitById } from "@/lib/db/queries/visits";
import { db } from "@/lib/db/client";
import {
  uploadJobPhoto,
  getSignedPhotos,
  deleteJobPhoto,
} from "@/lib/storage/photos";
import { validateAndReencodeImage } from "@/lib/security/file-validation";

const MAX_PHOTOS = 10;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Shared: load + authorise visit
// ---------------------------------------------------------------------------

async function loadVisit(visitId: string, tenantId: string, technicianId?: string) {
  const visit = await getVisitById(visitId, tenantId);
  if (!visit) return null;
  if (technicianId && visit.technician_id !== technicianId) return null;
  return visit;
}

// ---------------------------------------------------------------------------
// GET /api/visits/[id]/photos
// Returns signed URLs for every photo stored on the visit.
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const techId = isTechnicianScoped(auth.session)
    ? auth.session.user.technician_id
    : undefined;

  let visit;
  try {
    visit = await loadVisit(id, tenantId, techId);
  } catch (err) {
    console.error("[api] GET /api/visits/[id]/photos:", err);
    return NextResponse.json({ error: "Failed to load visit" }, { status: 500 });
  }
  if (!visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  try {
    const photos = await getSignedPhotos(visit.photo_urls ?? []);
    return NextResponse.json({ data: photos });
  } catch (err) {
    console.error("[api] GET /api/visits/[id]/photos sign:", err);
    return NextResponse.json({ error: "Failed to generate photo URLs" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/visits/[id]/photos
// Accepts multipart/form-data with a `file` field.
// Uploads to Supabase Storage, appends path to visit.photo_urls.
// Returns { data: { path, signedUrl } }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const techId = isTechnicianScoped(auth.session)
    ? auth.session.user.technician_id
    : undefined;

  let visit;
  try {
    visit = await loadVisit(id, tenantId, techId);
  } catch (err) {
    console.error("[api] POST /api/visits/[id]/photos load:", err);
    return NextResponse.json({ error: "Failed to load visit" }, { status: 500 });
  }
  if (!visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const currentCount = (visit.photo_urls ?? []).length;
  if (currentCount >= MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_PHOTOS} photos allowed per visit` },
      { status: 422 }
    );
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

  // Magic-byte sniff + re-encode (strips EXIF/GPS — a technician's phone
  // photo would otherwise retain embedded location data in the stored file)
  // rather than trusting the client-supplied Content-Type (security-audit M4/M6).
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const validated = await validateAndReencodeImage(inputBuffer, { maxSizeBytes: MAX_SIZE_BYTES });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.reason }, { status: 422 });
  }

  const filename = `photo-${Date.now()}.${validated.image.ext}`;

  let uploaded;
  try {
    uploaded = await uploadJobPhoto(id, tenantId, validated.image.buffer, filename, validated.image.mime);
  } catch (err) {
    console.error("[api] POST /api/visits/[id]/photos upload:", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  // Append path to visit.photo_urls
  const newUrls = [...(visit.photo_urls ?? []), uploaded.path];
  const { error: dbError } = await db
    .from("visits")
    .update({ photo_urls: newUrls })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (dbError) {
    // Best-effort cleanup: remove the uploaded file
    deleteJobPhoto(uploaded.path).catch(() => {});
    console.error("[api] POST /api/visits/[id]/photos db:", dbError);
    return NextResponse.json({ error: "Failed to save photo reference" }, { status: 500 });
  }

  return NextResponse.json({ data: uploaded }, { status: 201 });
}

// ---------------------------------------------------------------------------
// DELETE /api/visits/[id]/photos
// Accepts JSON body { path: string }.
// Removes from storage and visit.photo_urls.
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;

  const tenantId = getTenantId(auth.session);
  const { id } = await params;

  const techId = isTechnicianScoped(auth.session)
    ? auth.session.user.technician_id
    : undefined;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const path = (body as Record<string, unknown>)?.path;
  if (typeof path !== "string" || !path) {
    return NextResponse.json({ error: "Missing path" }, { status: 422 });
  }

  let visit;
  try {
    visit = await loadVisit(id, tenantId, techId);
  } catch (err) {
    console.error("[api] DELETE /api/visits/[id]/photos load:", err);
    return NextResponse.json({ error: "Failed to load visit" }, { status: 500 });
  }
  if (!visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  // Validate this path belongs to THIS visit specifically (security-audit M7 —
  // the prior check only verified the tenant-id prefix, so any user who owned
  // some visit in the tenant could delete another visit's photo by supplying
  // its path). photo_urls is the authoritative membership list for this visit.
  if (!(visit.photo_urls ?? []).includes(path)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await deleteJobPhoto(path);
  } catch (err) {
    console.error("[api] DELETE /api/visits/[id]/photos storage:", err);
    return NextResponse.json({ error: "Failed to delete photo" }, { status: 500 });
  }

  const newUrls = (visit.photo_urls ?? []).filter((p) => p !== path);
  const { error: dbError } = await db
    .from("visits")
    .update({ photo_urls: newUrls })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (dbError) {
    console.error("[api] DELETE /api/visits/[id]/photos db:", dbError);
    return NextResponse.json({ error: "Failed to update visit" }, { status: 500 });
  }

  return NextResponse.json({ data: { success: true } });
}
