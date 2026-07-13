/**
 * Server-only — never import in client components.
 * All storage operations use the service role client (bypasses RLS).
 */

import { db } from "@/lib/db/client";

const BUCKET = process.env.STORAGE_BUCKET ?? "job-photos";
const SIGNED_URL_EXPIRES_SECS = 3600; // 1 hour

export interface UploadedPhoto {
  path: string;
  signedUrl: string;
}

export interface SignedPhoto {
  path: string;
  signedUrl: string;
  uploadedAt: number; // ms epoch parsed from path
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function buildPhotoPath(
  tenantId: string,
  visitId: string,
  filename: string
): string {
  const ts = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return `${tenantId}/${visitId}/${ts}-${safe}`;
}

export function parseUploadedAt(path: string): number {
  const filename = path.split("/").pop() ?? "";
  const ts = parseInt(filename.split("-")[0] ?? "0", 10);
  return Number.isFinite(ts) ? ts : 0;
}

// ---------------------------------------------------------------------------
// uploadJobPhoto
// ---------------------------------------------------------------------------

export async function uploadJobPhoto(
  visitId: string,
  tenantId: string,
  buffer: Buffer,
  filename: string,
  mimetype: string
): Promise<UploadedPhoto> {
  const path = buildPhotoPath(tenantId, visitId, filename);

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimetype, upsert: false });

  if (uploadError) {
    throw new Error(`[storage] Upload failed: ${uploadError.message}`);
  }

  const { data: signData, error: signError } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRES_SECS);

  if (signError ?? !signData) {
    throw new Error(`[storage] Signing failed: ${signError?.message}`);
  }

  return { path, signedUrl: signData.signedUrl };
}

// ---------------------------------------------------------------------------
// getSignedPhotos — generate signed URLs for an array of stored paths
// ---------------------------------------------------------------------------

export async function getSignedPhotos(paths: string[]): Promise<SignedPhoto[]> {
  if (paths.length === 0) return [];

  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRES_SECS);

  if (error) throw new Error(`[storage] createSignedUrls failed: ${error.message}`);

  return (data ?? [])
    .filter((item): item is typeof item & { path: string; signedUrl: string } =>
      typeof item.signedUrl === "string" && typeof item.path === "string"
    )
    .map((item) => ({
      path: item.path,
      signedUrl: item.signedUrl,
      uploadedAt: parseUploadedAt(item.path),
    }));
}

// ---------------------------------------------------------------------------
// deleteJobPhoto
// ---------------------------------------------------------------------------

export async function deleteJobPhoto(path: string): Promise<void> {
  const { error } = await db.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`[storage] Delete failed: ${error.message}`);
}
