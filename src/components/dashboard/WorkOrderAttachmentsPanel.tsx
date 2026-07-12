"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Paperclip, Trash2, Loader2, Eye, EyeOff, Upload } from "lucide-react";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { useApiQuery } from "@/lib/utils/useApiQuery";
import { SectionCard } from "@/components/dashboard/WorkOrderDetail";
import type { WorkOrderAttachment } from "@/types/work-order-project";

function formatSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkOrderAttachmentsPanel({ workOrderId }: { workOrderId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const perms = role ? rolePermissions[role] : undefined;
  const canManage = perms?.canManageWorkOrderAttachments ?? false;

  const { data: attachments, loading, retry } = useApiQuery<WorkOrderAttachment[]>(`/api/work-orders/${workOrderId}/attachments`);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/work-orders/${workOrderId}/attachments`, { method: "POST", body: formData });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setUploadError(json.error ?? "Upload failed");
        return;
      }
      retry();
    } catch {
      setUploadError("Network error — please try again");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function toggleVisibility(att: WorkOrderAttachment) {
    setBusyId(att.id);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/attachments/${att.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_customer_visible: !att.is_customer_visible }),
      });
      if (res.ok) retry();
    } finally {
      setBusyId(null);
    }
  }

  async function removeAttachment(attId: string) {
    setBusyId(attId);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/attachments/${attId}`, { method: "DELETE" });
      if (res.ok) retry();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SectionCard title="Attachments">
      {uploadError && <p className="mb-2 text-xs text-red-600">{uploadError}</p>}
      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {!loading && (attachments ?? []).length === 0 && <p className="text-sm text-slate-400">No attachments yet.</p>}
      {!loading && (attachments ?? []).length > 0 && (
        <ul className="space-y-1.5">
          {(attachments ?? []).map((att) => (
            <li key={att.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-slate-50">
              <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-700">{att.file_name}</p>
                <p className="text-xs text-slate-400">{formatSize(att.file_size_bytes)}</p>
              </div>
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => toggleVisibility(att)}
                    disabled={busyId === att.id}
                    title={att.is_customer_visible ? "Visible to customer — click to hide" : "Hidden from customer — click to show"}
                    className="shrink-0 text-slate-400 hover:text-slate-600"
                  >
                    {att.is_customer_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    disabled={busyId === att.id}
                    className="shrink-0 text-slate-300 hover:text-red-500"
                    aria-label="Delete attachment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-3">
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileSelected} className="hidden" id={`wo-attach-${workOrderId}`} />
          <label
            htmlFor={`wo-attach-${workOrderId}`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Uploading…" : "Upload File"}
          </label>
        </div>
      )}
    </SectionCard>
  );
}
