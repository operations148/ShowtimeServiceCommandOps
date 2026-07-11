/**
 * Server-only — never import in client components.
 *
 * Work-order attachments (Phase 5). Private bucket by default — attachments
 * may contain customer PII (permits, signed documents); is_customer_visible
 * only controls whether the CUSTOMER PORTAL surface would show it (a later
 * phase), not public bucket ACLs.
 */
import { db } from "@/lib/db/client";

const BUCKET = process.env.WORK_ORDER_ATTACHMENT_BUCKET ?? "work-order-attachments";
export const ATTACHMENT_MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export async function uploadWorkOrderAttachment(
  tenantId: string,
  workOrderId: string,
  buffer: Buffer,
  mime: string,
  ext: string,
  originalFileName: string
): Promise<{ path: string; url: string }> {
  const safeName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const path = `${tenantId}/${workOrderId}/${Date.now()}-${safeName}.${ext}`;

  const { error } = await db.storage.from(BUCKET).upload(path, buffer, { upsert: false, contentType: mime });
  if (error) throw new Error(`[storage] Work order attachment upload failed: ${error.message}`);

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function deleteWorkOrderAttachment(path: string): Promise<void> {
  const { error } = await db.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`[storage] Work order attachment delete failed: ${error.message}`);
}
