import type { Metadata } from "next";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PropertiesTable } from "@/components/dashboard/PropertiesTable";
import { NewPropertyButton } from "@/components/dashboard/NewPropertyButton";

export const metadata: Metadata = { title: "Properties" };

export default function PropertiesPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: "Properties" }]} className="mb-2" />
          <h2 className="font-display text-2xl font-bold text-slate-900">Properties</h2>
          <p className="mt-1 text-sm text-slate-500">
            Service addresses, pool equipment records, and access notes.
          </p>
        </div>
        <NewPropertyButton />
      </div>

      <PropertiesTable />
    </div>
  );
}
