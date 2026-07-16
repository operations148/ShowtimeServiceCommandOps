"use client";

import { useState, useEffect } from "react";
import { Loader2, History } from "lucide-react";
import { statusLabel } from "@/components/portal/PortalShell";

interface WO { id: string; wo_number: string; title: string; status: string; service_category: string; scheduled_date: string | null; completed_at: string | null }

export default function PortalWorkHistoryPage() {
  const [rows, setRows] = useState<WO[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/portal/work-history").then((r) => r.json()).then((j) => setRows(j.data ?? [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-slate-900">Work History</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No service visits yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {rows.map((wo) => (
            <div key={wo.id} className="flex items-start gap-3 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100"><History className="h-4 w-4 text-slate-500" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{wo.title}</p>
                <p className="font-mono text-xs text-slate-400">{wo.wo_number} · {statusLabel(wo.service_category)}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{statusLabel(wo.status)}</span>
                <p className="mt-1 text-xs text-slate-400">{wo.completed_at ? `Completed ${new Date(wo.completed_at).toLocaleDateString("en-US")}` : wo.scheduled_date ?? ""}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
