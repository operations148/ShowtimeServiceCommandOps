"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ChangeOrder } from "@/types/change-order";
import type { WorkOrderWithRelations } from "@/types/work-order";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChangeOrderEditor } from "@/components/dashboard/ChangeOrderEditor";

export function NewChangeOrderClient({ workOrderId }: { workOrderId: string }) {
  const router = useRouter();
  const [workOrder, setWorkOrder] = useState<WorkOrderWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/work-orders/${workOrderId}`);
        const json = (await res.json()) as { data?: WorkOrderWithRelations; error?: string };
        if (!active) return;
        if (!res.ok || !json.data) setError(json.error ?? "Failed to load work order");
        else setWorkOrder(json.data);
      } catch {
        if (active) setError("Network error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [workOrderId]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error || !workOrder) {
    return (
      <div className="mx-auto max-w-4xl">
        <ErrorState message={error ?? "Work order not found"} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Work Orders", href: "/dashboard/work-orders" },
            { label: workOrder.wo_number, href: `/dashboard/work-orders/${workOrderId}` },
            { label: "New Change Order" },
          ]}
          className="mb-2"
        />
        <h2 className="font-display text-2xl font-bold text-slate-900">New Change Order</h2>
        <p className="mt-1 text-sm text-slate-500">For {workOrder.wo_number} · {workOrder.title}</p>
      </div>

      <ChangeOrderEditor
        workOrderId={workOrderId}
        defaultCustomerName={workOrder.property_customer_name}
        onSaved={(co: ChangeOrder) => router.push(`/dashboard/change-orders/${co.id}`)}
        onCancel={() => router.push(`/dashboard/work-orders/${workOrderId}`)}
      />
    </div>
  );
}
