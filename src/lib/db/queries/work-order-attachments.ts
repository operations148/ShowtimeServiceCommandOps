import { db } from "@/lib/db/client";
import type { WorkOrderAttachment, AttachmentSource } from "@/types/work-order-project";
import type { ServiceCategory } from "@/types/work-order";

type AttachmentRow = {
  id: string;
  tenant_id: string;
  work_order_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number | null;
  is_customer_visible: boolean;
  source: string;
  uploaded_by: string | null;
  created_at: string;
};

function mapAttachment(row: AttachmentRow): WorkOrderAttachment {
  return { ...row, source: row.source as AttachmentSource };
}

export async function listWorkOrderAttachments(workOrderId: string, tenantId: string): Promise<WorkOrderAttachment[]> {
  const { data, error } = await db
    .from("work_order_attachments")
    .select("*")
    .eq("work_order_id", workOrderId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`[db] listWorkOrderAttachments: ${error.message}`);
  return ((data ?? []) as AttachmentRow[]).map(mapAttachment);
}

export async function createWorkOrderAttachment(
  workOrderId: string,
  tenantId: string,
  input: { filePath: string; fileName: string; mimeType: string; fileSizeBytes: number; isCustomerVisible: boolean; source: AttachmentSource; uploadedBy?: string | null }
): Promise<WorkOrderAttachment> {
  const { data, error } = await db
    .from("work_order_attachments")
    .insert({
      tenant_id: tenantId,
      work_order_id: workOrderId,
      file_path: input.filePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      is_customer_visible: input.isCustomerVisible,
      source: input.source,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`[db] createWorkOrderAttachment: ${error.message}`);
  return mapAttachment(data as AttachmentRow);
}

export async function getWorkOrderAttachment(id: string, tenantId: string): Promise<WorkOrderAttachment | undefined> {
  const { data, error } = await db.from("work_order_attachments").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`[db] getWorkOrderAttachment: ${error.message}`);
  return data ? mapAttachment(data as AttachmentRow) : undefined;
}

export async function setAttachmentVisibility(
  id: string,
  tenantId: string,
  isCustomerVisible: boolean
): Promise<{ ok: true; data: WorkOrderAttachment } | { ok: false; notFound: true }> {
  const { data, error } = await db
    .from("work_order_attachments")
    .update({ is_customer_visible: isCustomerVisible })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] setAttachmentVisibility: ${error.message}`);
  if (!data) return { ok: false, notFound: true };
  return { ok: true, data: mapAttachment(data as AttachmentRow) };
}

export async function deleteWorkOrderAttachmentRow(id: string, tenantId: string): Promise<WorkOrderAttachment | undefined> {
  const { data, error } = await db
    .from("work_order_attachments")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] deleteWorkOrderAttachmentRow: ${error.message}`);
  return data ? mapAttachment(data as AttachmentRow) : undefined;
}

// ─── Auto-attachment rules ─────────────────────────────────────────────────────

/**
 * Applies every active rule matching the work order's service category (or a
 * category-agnostic rule) at WO-creation time, copying each into
 * work_order_attachments with source='auto'. Best-effort — a failure here
 * must never block work-order creation.
 */
export async function applyAttachmentRules(
  workOrderId: string,
  tenantId: string,
  serviceCategory: ServiceCategory
): Promise<number> {
  try {
    const { data: rules, error } = await db
      .from("work_order_attachment_rules")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .or(`service_category.eq.${serviceCategory},service_category.is.null`);
    if (error) throw error;
    const rows = (rules ?? []) as Array<{ file_path: string; file_name: string; mime_type: string }>;
    if (rows.length === 0) return 0;

    const { error: insErr } = await db.from("work_order_attachments").insert(
      rows.map((r) => ({
        tenant_id: tenantId,
        work_order_id: workOrderId,
        file_path: r.file_path,
        file_name: r.file_name,
        mime_type: r.mime_type,
        is_customer_visible: false,
        source: "auto",
      }))
    );
    if (insErr) throw insErr;
    return rows.length;
  } catch (err) {
    console.error("[db] applyAttachmentRules (non-fatal):", err instanceof Error ? err.message : err);
    return 0;
  }
}
