"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, GitPullRequestArrow, ChevronRight } from "lucide-react";
import { money, statusLabel } from "@/components/portal/PortalShell";

interface Doc { id: string; number: string; title: string; status: string; amount: number }

export default function PortalChangeOrdersPage() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/portal/change-orders").then((r) => r.json()).then((j) => setRows(j.data ?? [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-slate-900">Change Orders</h1>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <GitPullRequestArrow className="mx-auto mb-2 h-7 w-7 text-slate-300" />
          <p className="text-sm text-slate-500">No change orders yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {rows.map((c) => (
            <Link key={c.id} href={`/portal/change-orders/${c.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{c.title}</p>
                <p className="font-mono text-xs text-slate-400">{c.number} · {statusLabel(c.status)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-sm font-semibold text-slate-900">{money(c.amount)}</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
