"use client";

import { forwardRef, useImperativeHandle, useState, useEffect } from "react";
import { User, Smartphone, Mail, Phone, ChevronRight } from "lucide-react";
import { useApiQuery } from "@/lib/utils/useApiQuery";
import { ErrorState } from "@/components/ui/ErrorState";

export interface Technician {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
}

export interface TechniciansListHandle {
  refresh: () => void;
  updateTechnician: (updated: Technician) => void;
}

interface Props {
  onSelect: (tech: Technician) => void;
}

export const TechniciansList = forwardRef<TechniciansListHandle, Props>(
  function TechniciansList({ onSelect }, ref) {
    const { data, error, loading, retry } = useApiQuery<Technician[]>(
      "/api/technicians?all=true"
    );

    const [rows, setRows] = useState<Technician[]>([]);

    useEffect(() => {
      if (data) setRows(data);
    }, [data]);

    useImperativeHandle(
      ref,
      () => ({
        refresh: retry,
        updateTechnician(updated: Technician) {
          setRows((prev) =>
            prev.map((t) => (t.id === updated.id ? updated : t))
          );
        },
      }),
      [retry]
    );

    // Sort: active first, inactive last
    const sorted = [...rows].sort((a, b) => {
      if (a.is_active === b.is_active) return a.name.localeCompare(b.name);
      return a.is_active ? -1 : 1;
    });

    if (error) return <ErrorState message={error} onRetry={retry} />;

    if (loading) {
      return (
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border px-6 py-4 last:border-0"
            >
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
              <div className="space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (sorted.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white py-16 text-center shadow-sm">
          <User className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">No technicians yet</p>
          <p className="text-xs text-slate-400">
            Add your first technician to start assigning jobs.
          </p>
        </div>
      );
    }

    const activeCount = sorted.filter((t) => t.is_active).length;

    return (
      <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="border-b border-border bg-slate-50/60 px-6 py-3">
          <p className="text-sm text-slate-500">
            <span className="font-medium text-slate-700">{activeCount}</span>{" "}
            active
            {sorted.length > activeCount && (
              <>
                {" · "}
                <span className="text-slate-400">
                  {sorted.length - activeCount} inactive
                </span>
              </>
            )}
          </p>
        </div>
        <ul className="divide-y divide-border">
          {sorted.map((tech) => (
            <li key={tech.id} className={tech.is_active ? undefined : "opacity-60"}>
              <button
                type="button"
                onClick={() => onSelect(tech)}
                className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                  {tech.name.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{tech.name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Mail className="h-3 w-3" />
                      {tech.email}
                    </span>
                    {tech.phone && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Phone className="h-3 w-3" />
                        {tech.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Smartphone className="h-3 w-3" />
                      Mobile access
                    </span>
                  </div>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      tech.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {tech.is_active ? "Active" : "Inactive"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
);
