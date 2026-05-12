"use client";

import { useRef, useState } from "react";
import { Plus, CheckCircle2, X } from "lucide-react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { TechniciansList, type TechniciansListHandle, type Technician } from "./TechniciansList";
import { NewTechnicianModal } from "./NewTechnicianModal";
import { EditTechnicianPanel } from "./EditTechnicianPanel";

type Toast = { type: "success" | "updated"; message: string };

export function TechniciansPageClient() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const listRef = useRef<TechniciansListHandle>(null);

  function showToast(t: Toast, ms = 6000) {
    setToast(t);
    setTimeout(() => setToast(null), ms);
  }

  function handleAddSuccess(name: string) {
    listRef.current?.refresh();
    showToast({ type: "success", message: `${name} added successfully` });
  }

  function handleUpdated(updated: Technician) {
    listRef.current?.updateTechnician(updated);
    setSelectedTech(null);
    showToast({ type: "updated", message: `${updated.name}'s details have been updated` });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Breadcrumb items={[{ label: "Technicians" }]} className="mb-2" />
          <h2 className="font-display text-2xl font-bold text-slate-900">Technicians</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage field technicians and job assignments.
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {toast && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="ml-1 rounded p-0.5 hover:bg-emerald-100"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            Add Technician
          </button>
        </div>
      </div>

      <TechniciansList ref={listRef} onSelect={setSelectedTech} />

      <NewTechnicianModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleAddSuccess}
      />

      {selectedTech && (
        <EditTechnicianPanel
          tech={selectedTech}
          onClose={() => setSelectedTech(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
