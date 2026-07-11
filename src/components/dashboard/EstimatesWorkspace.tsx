"use client";

import { useState } from "react";
import { FileText, Flag } from "lucide-react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EstimateDocumentsPanel } from "./EstimateDocumentsPanel";
import { EstimatesPageClient } from "./EstimatesPageClient";
import { cn } from "@/lib/utils";

/**
 * Phase 3 estimates workspace. Two tabs so the new full estimate-document
 * workflow is added WITHOUT losing the existing technician "needs estimate"
 * handoff data (which remains its own untouched view).
 */
export function EstimatesWorkspace() {
  const [tab, setTab] = useState<"documents" | "handoffs">("documents");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Estimates" }]} className="mb-2" />
        <h2 className="font-display text-2xl font-bold text-slate-900">Estimates</h2>
        <p className="mt-1 text-sm text-slate-500">
          Build, send, and track priced proposals — and the jobs technicians have flagged as needing one.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === "documents"} onClick={() => setTab("documents")} icon={FileText} label="Estimates" />
        <TabButton active={tab === "handoffs"} onClick={() => setTab("handoffs")} icon={Flag} label="Needs Estimate" />
      </div>

      {tab === "documents" ? <EstimateDocumentsPanel /> : <EstimatesPageClient embedded />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none",
        active
          ? "border-brand-500 text-brand-700"
          : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
