"use client";

import { useState, useEffect } from "react";
import { Loader2, Home, MapPin } from "lucide-react";
import type { PortalPropertySummary } from "@/types/portal";

export default function PortalPropertiesPage() {
  const [rows, setRows] = useState<PortalPropertySummary[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/portal/properties").then((r) => r.json()).then((j) => setRows(j.data ?? [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-slate-900">Properties</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No properties on file.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <div key={p.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50"><Home className="h-4 w-4 text-brand-500" /></div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{p.customer_name}</p>
                <p className="mt-0.5 flex items-start gap-1 text-sm text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />{p.address}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
