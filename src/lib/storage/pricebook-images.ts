/**
 * Server-only — never import in client components.
 *
 * Pricebook item images. Public bucket (catalog imagery, no PII by design —
 * the spec forbids customer data in the pricebook). File validation
 * (magic-byte sniff + re-encode/metadata strip) happens in the route via
 * src/lib/security/file-validation.ts before this module is called.
 */

import { db } from "@/lib/db/client";

const BUCKET = process.env.PRICEBOOK_IMAGE_BUCKET ?? "pricebook-images";
export const PRICEBOOK_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function uploadPricebookImage(
  tenantId: string,
  itemId: string,
  buffer: Buffer,
  mime: string,
  ext: string
): Promise<string> {
  const prefix = `${tenantId}/${itemId}`;
  const path = `${prefix}/${Date.now()}.${ext}`;

  // One image per item: clear any previous uploads for this item first.
  const { data: existing } = await db.storage.from(BUCKET).list(prefix);
  if (existing?.length) {
    await db.storage
      .from(BUCKET)
      .remove(existing.map((f) => `${prefix}/${f.name}`))
      .catch(() => null);
  }

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, buffer, { upsert: true, contentType: mime });

  if (error) throw new Error(`[storage] Pricebook image upload failed: ${error.message}`);

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deletePricebookImage(tenantId: string, itemId: string): Promise<void> {
  const prefix = `${tenantId}/${itemId}`;
  const { data: existing } = await db.storage.from(BUCKET).list(prefix);
  if (existing?.length) {
    await db.storage.from(BUCKET).remove(existing.map((f) => `${prefix}/${f.name}`));
  }
}
