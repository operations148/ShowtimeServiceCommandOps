"use client";

import { useRouter } from "next/navigation";
import type { Estimate } from "@/types/estimate";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EstimateEditor } from "@/components/dashboard/EstimateEditor";

export function NewEstimateClient() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Breadcrumb
          items={[{ label: "Estimates", href: "/dashboard/estimates" }, { label: "New" }]}
          className="mb-2"
        />
        <h2 className="font-display text-2xl font-bold text-slate-900">New Estimate</h2>
        <p className="mt-1 text-sm text-slate-500">
          Build a priced proposal. Totals are calculated on the server from the lines you enter.
        </p>
      </div>

      <EstimateEditor
        onSaved={(estimate: Estimate) => router.push(`/dashboard/estimates/${estimate.id}`)}
        onCancel={() => router.push("/dashboard/estimates")}
      />
    </div>
  );
}
