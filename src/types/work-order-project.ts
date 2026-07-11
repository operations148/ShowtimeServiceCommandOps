// Work-order project expansion: internal tasks and attachments (Phase 5).

import type { ServiceCategory } from "@/types/work-order";

export interface WorkOrderTask {
  id: string;
  tenant_id: string;
  work_order_id: string;
  title: string;
  is_completed: boolean;
  assigned_technician_id?: string | null;
  due_date?: string | null;
  sort_order: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type AttachmentSource = "manual" | "auto";

export interface WorkOrderAttachment {
  id: string;
  tenant_id: string;
  work_order_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes?: number | null;
  is_customer_visible: boolean;
  source: AttachmentSource;
  uploaded_by?: string | null;
  created_at: string;
}

export interface WorkOrderAttachmentRule {
  id: string;
  tenant_id: string;
  /** null = applies to all service categories. */
  service_category?: ServiceCategory | null;
  file_path: string;
  file_name: string;
  mime_type: string;
  description?: string | null;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
}
