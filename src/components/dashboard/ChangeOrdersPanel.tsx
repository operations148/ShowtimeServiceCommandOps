"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { ChangeOrderStatus, type ChangeOrder } from "@/types/change-order";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";
import { useApiQuery } from "@/lib/utils/useApiQuery";
import { SectionCard } from "@/components/dashboard/WorkOrderDetail";
import { cn } from "@/lib/utils";

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const STATUS_BADGE: Record<ChangeOrderStatus, string> = {
  [ChangeOrderStatus.DRAFT]: "bg-slate-100 text-slate-600",
  [ChangeOrderStatus.SENT]: "bg-blue-50 text-blue-700",
  [ChangeOrderStatus.VIEWED]: "bg-cyan-50 text-cyan-700",
  [ChangeOrderStatus.ACCEPTED]: "bg-emerald-50 text-emerald-700",
  [ChangeOrderStatus.REJECTED]: "bg-red-50 text-red-600",
  [ChangeOrderStatus.EXPIRED]: "bg-amber-50 text-amber-700",
  [ChangeOrderStatus.VOIDED]: "bg-slate-100 text-slate-400",
};

export function ChangeOrdersPanel({ workOrderId }: { workOrderId: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  const perms = role ? rolePermissions[role] : undefined;
  const { data: changeOrders, loading } = useApiQuery<ChangeOrder[]>(`/api/work-orders/${workOrderId}/change-orders`);

  if (!(perms?.canViewChangeOrders ?? false)) return null;

  return (
    <SectionCard title="Change Orders">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">Scope, price, or schedule changes to this job</p>
        {perms?.canManageChangeOrders && (
          <Link
            href={`/dashboard/work-orders/${workOrderId}/change-orders/new`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
          >
            <Plus className="h-3.5 w-3.5" /> New Change Order
          </Link>
        )}
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {!loading && (changeOrders ?? []).length === 0 && (
        <p className="text-sm text-slate-400">No change orders yet.</p>
      )}
      {!loading && (changeOrders ?? []).length > 0 && (
        <ul className="divide-y divide-border">
          {(changeOrders ?? []).map((co) => (
            <li key={co.id}>
              <Link
                href={`/dashboard/change-orders/${co.id}`}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 -mx-1 px-1 rounded-lg"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-slate-800">{co.change_order_number}</span>
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_BADGE[co.status])}>
                      {co.status}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{co.reason}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">{money(co.total_impact_cents)}</span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
