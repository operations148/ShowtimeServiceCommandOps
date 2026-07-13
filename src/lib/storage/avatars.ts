/**
 * Server-only — never import in client components.
 * Avatars bucket is public; getPublicUrl() returns a stable CDN URL.
 *
 * File validation (magic-byte sniff + metadata strip) happens in the route
 * via src/lib/security/file-validation.ts before this module is called —
 * uploadAvatar takes an already-validated, re-encoded buffer.
 */

import { db } from "@/lib/db/client";

const AVATAR_BUCKET = process.env.AVATAR_BUCKET ?? "avatars";
export const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function uploadAvatar(
  userId: string,
  buffer: Buffer,
  mime: string,
  ext: string
): Promise<string> {
  const path = `${userId}/${Date.now()}.${ext}`;

  // Remove existing avatars for this user before uploading the new one
  const { data: existing } = await db.storage
    .from(AVATAR_BUCKET)
    .list(userId);

  if (existing?.length) {
    await db.storage
      .from(AVATAR_BUCKET)
      .remove(existing.map((f) => `${userId}/${f.name}`))
      .catch(() => null);
  }

  const { error } = await db.storage
    .from(AVATAR_BUCKET)
    .upload(path, buffer, { upsert: true, contentType: mime });

  if (error) throw new Error(`[storage] Avatar upload failed: ${error.message}`);

  const { data } = db.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteAvatar(userId: string): Promise<void> {
  const { data: existing } = await db.storage
    .from(AVATAR_BUCKET)
    .list(userId);

  if (existing?.length) {
    await db.storage
      .from(AVATAR_BUCKET)
      .remove(existing.map((f) => `${userId}/${f.name}`));
  }
}
