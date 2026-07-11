"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  MapPin,
  KeyRound,
  FileText,
  ClipboardList,
  ExternalLink,
  Wrench,
  Pencil,
  Check,
  X,
  Info,
  Building2,
  Droplets,
  Filter as FilterIcon,
  Flame,
  Zap,
  Cpu,
  CalendarDays,
  Plus,
  User,
} from "lucide-react";
import {
  SanitizerType,
  PumpSpeedType,
  FilterType,
  HeaterType,
  PoolShape,
} from "@/types/property";
import type {
  PropertyWithRelations,
  PoolEquipment,
  PoolPump,
  PoolFilter,
  PoolHeater,
  SanitizerSystem,
  AutomationSystem,
} from "@/types/property";
import type { WorkOrderWithRelations } from "@/types/work-order";
import { WorkOrderStatus } from "@/types/work-order";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { cn } from "@/lib/utils";
import { NewWorkOrderModal } from "@/components/dashboard/NewWorkOrderModal";
import { ServiceScheduleCard } from "@/components/dashboard/ServiceScheduleCard";

// ─── Enum label maps ───────────────────────────────────────────────────────────

const PUMP_SPEED_LABELS: Record<PumpSpeedType, string> = {
  [PumpSpeedType.SINGLE_SPEED]:   "Single Speed",
  [PumpSpeedType.DUAL_SPEED]:     "Dual Speed",
  [PumpSpeedType.VARIABLE_SPEED]: "Variable Speed",
};

const FILTER_TYPE_LABELS: Record<FilterType, string> = {
  [FilterType.CARTRIDGE]: "Cartridge",
  [FilterType.DE]:        "DE (Diatomaceous Earth)",
  [FilterType.SAND]:      "Sand",
};

const HEATER_TYPE_LABELS: Record<HeaterType, string> = {
  [HeaterType.GAS]:                "Gas",
  [HeaterType.ELECTRIC_HEAT_PUMP]: "Electric Heat Pump",
  [HeaterType.SOLAR]:              "Solar",
  [HeaterType.NONE]:               "None",
};

const SANITIZER_TYPE_LABELS: Record<SanitizerType, string> = {
  [SanitizerType.CHLORINE]:  "Chlorine",
  [SanitizerType.SALTWATER]: "Saltwater / Salt Cell",
  [SanitizerType.UV]:        "UV",
  [SanitizerType.OZONE]:     "Ozone",
  [SanitizerType.MINERAL]:   "Mineral",
  [SanitizerType.OTHER]:     "Other",
};

const POOL_SHAPE_LABELS: Record<PoolShape, string> = {
  [PoolShape.RECTANGLE]: "Rectangle",
  [PoolShape.FREEFORM]:  "Freeform",
  [PoolShape.LAP]:       "Lap Pool",
  [PoolShape.SPORT]:     "Sport Pool",
  [PoolShape.OTHER]:     "Other",
};

const WO_STATUS: Record<WorkOrderStatus, { label: string; cls: string }> = {
  [WorkOrderStatus.NEW]:             { label: "New",             cls: "bg-slate-100 text-slate-600" },
  [WorkOrderStatus.ASSIGNED]:        { label: "Assigned",        cls: "bg-blue-50 text-blue-700" },
  [WorkOrderStatus.SCHEDULED]:       { label: "Scheduled",       cls: "bg-indigo-50 text-indigo-700" },
  [WorkOrderStatus.IN_PROGRESS]:     { label: "In Progress",     cls: "bg-brand-50 text-brand-700" },
  [WorkOrderStatus.ON_HOLD]:         { label: "On Hold",         cls: "bg-amber-50 text-amber-700" },
  [WorkOrderStatus.COMPLETED]:       { label: "Completed",       cls: "bg-emerald-50 text-emerald-700" },
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: { label: "Needs Follow-Up", cls: "bg-orange-50 text-orange-700" },
  [WorkOrderStatus.ESTIMATE_NEEDED]: { label: "Estimate Needed", cls: "bg-amber-50 text-amber-700" },
  [WorkOrderStatus.CLOSED]:          { label: "Closed",          cls: "bg-violet-50 text-violet-700" },
  [WorkOrderStatus.CANCELLED]:       { label: "Cancelled",       cls: "bg-red-50 text-red-500" },
  [WorkOrderStatus.ARCHIVED]:        { label: "Archived",        cls: "bg-slate-100 text-slate-400" },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Shared input styles ───────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";
const selectCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200";
const fieldLabelCls = "mb-1 block text-xs font-medium text-slate-500";

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-white p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-700">{children}</dd>
    </div>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
    >
      <Pencil className="h-3 w-3" />
      Edit
    </button>
  );
}

function SaveCancelButtons({ onSave, onCancel, disabled }: { onSave: () => void; onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-60"
      >
        <Check className="h-3 w-3" />
        {disabled ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 disabled:opacity-60"
      >
        <X className="h-3 w-3" />
        Cancel
      </button>
    </div>
  );
}

function EquipmentBlock({
  title,
  icon: Icon,
  missing,
  children,
}: {
  title: string;
  icon: LucideIcon;
  missing?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs font-semibold text-slate-500">{title}</span>
      </div>
      {missing ? (
        <p className="text-xs text-slate-300">Not on file</p>
      ) : (
        <dl className="space-y-1.5">{children}</dl>
      )}
    </div>
  );
}

function EF({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start gap-1.5">
      <dt className="w-24 shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className="text-xs text-slate-700">{value}</dd>
    </div>
  );
}

function EqSubFormHeader({ label }: { label: string }) {
  return (
    <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400 first:mt-0">
      {label}
    </p>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PropertyDetail({
  property: initialProperty,
  relatedWorkOrders,
}: {
  property: PropertyWithRelations;
  relatedWorkOrders: WorkOrderWithRelations[];
}) {
  const [prop, setProp] = useState<PropertyWithRelations>(initialProperty);
  const [banner, setBanner] = useState<string | null>(null);

  // Equipment editing
  const [editingEquipment, setEditingEquipment] = useState(false);
  const [eqDraft, setEqDraft] = useState<PoolEquipment>(prop.pool_equipment ?? {});

  // Access notes editing
  const [editingAccess, setEditingAccess] = useState(false);
  const [accessDraft, setAccessDraft] = useState({
    gate_code: prop.gate_code ?? "",
    access_notes: prop.access_notes ?? "",
  });

  // Service notes editing
  const [editingService, setEditingService] = useState(false);
  const [serviceDraft, setServiceDraft] = useState(prop.service_notes ?? "");

  // New WO modal
  const [newWOOpen, setNewWOOpen] = useState(false);
  const [newWOBanner, setNewWOBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    if (!newWOBanner) return;
    const t = setTimeout(() => setNewWOBanner(null), 6000);
    return () => clearTimeout(t);
  }, [newWOBanner]);

  const [saving, setSaving] = useState(false);

  async function patchProperty(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/properties/${prop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json() as { data?: PropertyWithRelations; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      if (json.data) setProp(json.data);
      return true;
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // ── Equipment edit handlers
  function startEditEquipment() {
    setEqDraft(prop.pool_equipment ?? {});
    setEditingEquipment(true);
  }
  async function saveEquipment() {
    const ok = await patchProperty({ pool_equipment: { ...eqDraft, last_updated: new Date().toISOString() } });
    if (ok) {
      setEditingEquipment(false);
      setBanner("Equipment saved");
    }
  }
  function cancelEquipment() {
    setEqDraft(prop.pool_equipment ?? {});
    setEditingEquipment(false);
  }

  // ── Access edit handlers
  function startEditAccess() {
    setAccessDraft({ gate_code: prop.gate_code ?? "", access_notes: prop.access_notes ?? "" });
    setEditingAccess(true);
  }
  async function saveAccess() {
    const ok = await patchProperty({
      gate_code: accessDraft.gate_code || null,
      access_notes: accessDraft.access_notes || null,
    });
    if (ok) {
      setEditingAccess(false);
      setBanner("Access information saved");
    }
  }
  function cancelAccess() {
    setAccessDraft({ gate_code: prop.gate_code ?? "", access_notes: prop.access_notes ?? "" });
    setEditingAccess(false);
  }

  // ── Service notes edit handlers
  function startEditService() {
    setServiceDraft(prop.service_notes ?? "");
    setEditingService(true);
  }
  async function saveServiceNotes() {
    const ok = await patchProperty({ service_notes: serviceDraft || null });
    if (ok) {
      setEditingService(false);
      setBanner("Service notes saved");
    }
  }
  function cancelServiceNotes() {
    setServiceDraft(prop.service_notes ?? "");
    setEditingService(false);
  }

  // ── Equipment draft updaters
  function updatePump(k: keyof PoolPump, v: string | number | undefined) {
    setEqDraft((prev) => ({ ...prev, pump: { ...prev.pump, [k]: v || undefined } }));
  }
  function updateFilter(k: keyof PoolFilter, v: string | number | undefined) {
    setEqDraft((prev) => ({ ...prev, filter: { ...prev.filter, [k]: v || undefined } }));
  }
  function updateHeater(k: keyof PoolHeater, v: string | number | undefined) {
    setEqDraft((prev) => ({ ...prev, heater: { ...prev.heater, [k]: v || undefined } }));
  }
  function updateSanitizer(k: keyof SanitizerSystem, v: string | undefined) {
    setEqDraft((prev) => ({ ...prev, sanitizer: { ...prev.sanitizer, [k]: v || undefined } }));
  }
  function updateAutomation(k: keyof AutomationSystem, v: string | undefined) {
    setEqDraft((prev) => ({ ...prev, automation: { ...prev.automation, [k]: v || undefined } }));
  }

  const eq = prop.pool_equipment;
  const hasEquipment = !!eq;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl space-y-5">

      {/* ── Banners ── */}
      {banner && (
        <div className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{banner}</span>
        </div>
      )}
      {newWOBanner && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{newWOBanner}</span>
        </div>
      )}

      {/* ── Header ── */}
      <div>
        <Breadcrumb
          items={[
            { label: "Properties", href: "/dashboard/properties" },
            { label: prop.customer_name },
          ]}
          className="mb-2"
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                {prop.customer_name.charAt(0)}
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900">{prop.customer_name}</h2>
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                  prop.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                )}
              >
                {prop.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {prop.address_line1}
              {prop.address_line2 ? `, ${prop.address_line2}` : ""}, {prop.city}, {prop.state}{" "}
              {prop.zip}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNewWOOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            New Work Order
          </button>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* ── Left column ── */}
        <div className="space-y-5 lg:col-span-2">

          {/* Pool Equipment */}
          <SectionCard
            title="Pool Equipment"
            action={
              editingEquipment ? (
                <SaveCancelButtons onSave={saveEquipment} onCancel={cancelEquipment} disabled={saving} />
              ) : (
                <EditButton onClick={startEditEquipment} />
              )
            }
          >
            {editingEquipment ? (
              /* ── Equipment Edit Form ── */
              <div className="space-y-1">

                {/* Pool physical specs */}
                <EqSubFormHeader label="Pool Specs" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabelCls}>Size (gallons)</label>
                    <input
                      type="number"
                      className={inputCls}
                      value={eqDraft.pool_size_gallons ?? ""}
                      onChange={(e) =>
                        setEqDraft((prev) => ({
                          ...prev,
                          pool_size_gallons: e.target.value ? parseInt(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Shape</label>
                    <select
                      className={selectCls}
                      value={eqDraft.pool_shape ?? ""}
                      onChange={(e) =>
                        setEqDraft((prev) => ({
                          ...prev,
                          pool_shape: (e.target.value as PoolShape) || undefined,
                        }))
                      }
                    >
                      <option value="">— Select —</option>
                      {Object.values(PoolShape).map((s) => (
                        <option key={s} value={s}>{POOL_SHAPE_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pump */}
                <EqSubFormHeader label="Pump" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabelCls}>Make</label>
                    <input className={inputCls} value={eqDraft.pump?.make ?? ""} onChange={(e) => updatePump("make", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Model</label>
                    <input className={inputCls} value={eqDraft.pump?.model ?? ""} onChange={(e) => updatePump("model", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Serial Number</label>
                    <input className={inputCls} value={eqDraft.pump?.serial_number ?? ""} onChange={(e) => updatePump("serial_number", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Install Date</label>
                    <input type="date" className={inputCls} value={eqDraft.pump?.install_date ?? ""} onChange={(e) => updatePump("install_date", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Speed Type</label>
                    <select className={selectCls} value={eqDraft.pump?.type ?? ""} onChange={(e) => updatePump("type", (e.target.value as PumpSpeedType) || undefined)}>
                      <option value="">— Select —</option>
                      {Object.values(PumpSpeedType).map((t) => (
                        <option key={t} value={t}>{PUMP_SPEED_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelCls}>HP</label>
                    <input type="number" step="0.5" className={inputCls} value={eqDraft.pump?.hp ?? ""} onChange={(e) => updatePump("hp", e.target.value ? parseFloat(e.target.value) : undefined)} />
                  </div>
                </div>
                <div>
                  <label className={fieldLabelCls}>Pump Notes</label>
                  <textarea rows={2} className={inputCls} value={eqDraft.pump?.notes ?? ""} onChange={(e) => updatePump("notes", e.target.value)} />
                </div>

                {/* Filter */}
                <EqSubFormHeader label="Filter" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabelCls}>Make</label>
                    <input className={inputCls} value={eqDraft.filter?.make ?? ""} onChange={(e) => updateFilter("make", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Model</label>
                    <input className={inputCls} value={eqDraft.filter?.model ?? ""} onChange={(e) => updateFilter("model", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Serial Number</label>
                    <input className={inputCls} value={eqDraft.filter?.serial_number ?? ""} onChange={(e) => updateFilter("serial_number", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Install Date</label>
                    <input type="date" className={inputCls} value={eqDraft.filter?.install_date ?? ""} onChange={(e) => updateFilter("install_date", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Filter Type</label>
                    <select className={selectCls} value={eqDraft.filter?.type ?? ""} onChange={(e) => updateFilter("type", (e.target.value as FilterType) || undefined)}>
                      <option value="">— Select —</option>
                      {Object.values(FilterType).map((t) => (
                        <option key={t} value={t}>{FILTER_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Size (sq ft)</label>
                    <input type="number" className={inputCls} value={eqDraft.filter?.size_sq_ft ?? ""} onChange={(e) => updateFilter("size_sq_ft", e.target.value ? parseFloat(e.target.value) : undefined)} />
                  </div>
                </div>
                <div>
                  <label className={fieldLabelCls}>Filter Notes</label>
                  <textarea rows={2} className={inputCls} value={eqDraft.filter?.notes ?? ""} onChange={(e) => updateFilter("notes", e.target.value)} />
                </div>

                {/* Heater */}
                <EqSubFormHeader label="Heater" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabelCls}>Make</label>
                    <input className={inputCls} value={eqDraft.heater?.make ?? ""} onChange={(e) => updateHeater("make", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Model</label>
                    <input className={inputCls} value={eqDraft.heater?.model ?? ""} onChange={(e) => updateHeater("model", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Serial Number</label>
                    <input className={inputCls} value={eqDraft.heater?.serial_number ?? ""} onChange={(e) => updateHeater("serial_number", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Install Date</label>
                    <input type="date" className={inputCls} value={eqDraft.heater?.install_date ?? ""} onChange={(e) => updateHeater("install_date", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Heater Type</label>
                    <select className={selectCls} value={eqDraft.heater?.type ?? ""} onChange={(e) => updateHeater("type", (e.target.value as HeaterType) || undefined)}>
                      <option value="">— Select —</option>
                      {Object.values(HeaterType).map((t) => (
                        <option key={t} value={t}>{HEATER_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelCls}>BTU Output</label>
                    <input type="number" className={inputCls} value={eqDraft.heater?.btu_output ?? ""} onChange={(e) => updateHeater("btu_output", e.target.value ? parseInt(e.target.value) : undefined)} />
                  </div>
                </div>
                <div>
                  <label className={fieldLabelCls}>Heater Notes</label>
                  <textarea rows={2} className={inputCls} value={eqDraft.heater?.notes ?? ""} onChange={(e) => updateHeater("notes", e.target.value)} />
                </div>

                {/* Sanitizer */}
                <EqSubFormHeader label="Sanitizer System" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabelCls}>Make</label>
                    <input className={inputCls} value={eqDraft.sanitizer?.make ?? ""} onChange={(e) => updateSanitizer("make", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Model</label>
                    <input className={inputCls} value={eqDraft.sanitizer?.model ?? ""} onChange={(e) => updateSanitizer("model", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Serial Number</label>
                    <input className={inputCls} value={eqDraft.sanitizer?.serial_number ?? ""} onChange={(e) => updateSanitizer("serial_number", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Install Date</label>
                    <input type="date" className={inputCls} value={eqDraft.sanitizer?.install_date ?? ""} onChange={(e) => updateSanitizer("install_date", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className={fieldLabelCls}>Sanitizer Type</label>
                    <select className={selectCls} value={eqDraft.sanitizer?.type ?? ""} onChange={(e) => updateSanitizer("type", (e.target.value as SanitizerType) || undefined)}>
                      <option value="">— Select —</option>
                      {Object.values(SanitizerType).map((t) => (
                        <option key={t} value={t}>{SANITIZER_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={fieldLabelCls}>Sanitizer Notes</label>
                  <textarea rows={2} className={inputCls} value={eqDraft.sanitizer?.notes ?? ""} onChange={(e) => updateSanitizer("notes", e.target.value)} />
                </div>

                {/* Automation */}
                <EqSubFormHeader label="Automation System" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabelCls}>Make</label>
                    <input className={inputCls} value={eqDraft.automation?.make ?? ""} onChange={(e) => updateAutomation("make", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Model</label>
                    <input className={inputCls} value={eqDraft.automation?.model ?? ""} onChange={(e) => updateAutomation("model", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Serial Number</label>
                    <input className={inputCls} value={eqDraft.automation?.serial_number ?? ""} onChange={(e) => updateAutomation("serial_number", e.target.value)} />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Install Date</label>
                    <input type="date" className={inputCls} value={eqDraft.automation?.install_date ?? ""} onChange={(e) => updateAutomation("install_date", e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className={fieldLabelCls}>Automation Notes</label>
                  <textarea rows={2} className={inputCls} value={eqDraft.automation?.notes ?? ""} onChange={(e) => updateAutomation("notes", e.target.value)} />
                </div>

                {/* Additional notes */}
                <EqSubFormHeader label="Additional Notes" />
                <textarea
                  rows={3}
                  className={inputCls}
                  value={eqDraft.additional_notes ?? ""}
                  onChange={(e) =>
                    setEqDraft((prev) => ({ ...prev, additional_notes: e.target.value || undefined }))
                  }
                />
              </div>
            ) : !hasEquipment ? (
              /* ── No equipment state ── */
              <div className="flex flex-col items-center gap-2 py-8">
                <Wrench className="h-8 w-8 text-slate-200" />
                <p className="text-sm font-medium text-slate-400">No equipment data on file</p>
                <p className="text-xs text-slate-400">Click Edit to add pool equipment details.</p>
              </div>
            ) : (
              /* ── Equipment Display ── */
              <div className="space-y-4">
                {/* Pool specs summary */}
                <div className="flex flex-wrap items-center gap-4">
                  {eq.pool_size_gallons && (
                    <div className="flex items-center gap-1.5">
                      <Droplets className="h-4 w-4 text-brand-400" />
                      <span className="text-sm font-semibold text-slate-700">
                        {eq.pool_size_gallons.toLocaleString()} gal
                      </span>
                    </div>
                  )}
                  {eq.pool_shape && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {POOL_SHAPE_LABELS[eq.pool_shape]}
                    </span>
                  )}
                  {eq.last_updated && (
                    <span className="ml-auto text-xs text-slate-400">
                      Updated {formatDateTime(eq.last_updated)}
                    </span>
                  )}
                </div>

                {/* Equipment grid */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Pump */}
                  <EquipmentBlock title="Pump" icon={Droplets} missing={!eq.pump}>
                    <EF label="Make / Model" value={[eq.pump?.make, eq.pump?.model].filter(Boolean).join(" ")} />
                    <EF label="Speed" value={eq.pump?.type ? PUMP_SPEED_LABELS[eq.pump.type] : null} />
                    <EF label="HP" value={eq.pump?.hp} />
                    <EF label="Serial" value={eq.pump?.serial_number} />
                    <EF label="Installed" value={eq.pump?.install_date ? formatDate(eq.pump.install_date) : null} />
                    {eq.pump?.notes && (
                      <div className="mt-1.5 rounded border-l-2 border-amber-300 bg-amber-50 px-2 py-1">
                        <p className="text-xs text-amber-700">{eq.pump.notes}</p>
                      </div>
                    )}
                  </EquipmentBlock>

                  {/* Filter */}
                  <EquipmentBlock title="Filter" icon={FilterIcon} missing={!eq.filter}>
                    <EF label="Make / Model" value={[eq.filter?.make, eq.filter?.model].filter(Boolean).join(" ")} />
                    <EF label="Type" value={eq.filter?.type ? FILTER_TYPE_LABELS[eq.filter.type] : null} />
                    <EF label="Size" value={eq.filter?.size_sq_ft ? `${eq.filter.size_sq_ft} sq ft` : null} />
                    <EF label="Serial" value={eq.filter?.serial_number} />
                    <EF label="Installed" value={eq.filter?.install_date ? formatDate(eq.filter.install_date) : null} />
                    {eq.filter?.notes && (
                      <div className="mt-1.5 rounded border-l-2 border-slate-300 bg-slate-50 px-2 py-1">
                        <p className="text-xs text-slate-600">{eq.filter.notes}</p>
                      </div>
                    )}
                  </EquipmentBlock>

                  {/* Heater */}
                  <EquipmentBlock title="Heater" icon={Flame} missing={!eq.heater}>
                    <EF label="Make / Model" value={[eq.heater?.make, eq.heater?.model].filter(Boolean).join(" ")} />
                    <EF label="Type" value={eq.heater?.type ? HEATER_TYPE_LABELS[eq.heater.type] : null} />
                    <EF label="BTU" value={eq.heater?.btu_output ? `${(eq.heater.btu_output / 1000).toFixed(0)}k BTU` : null} />
                    <EF label="Serial" value={eq.heater?.serial_number} />
                    <EF label="Installed" value={eq.heater?.install_date ? formatDate(eq.heater.install_date) : null} />
                    {eq.heater?.notes && (
                      <div className="mt-1.5 rounded border-l-2 border-slate-300 bg-slate-50 px-2 py-1">
                        <p className="text-xs text-slate-600">{eq.heater.notes}</p>
                      </div>
                    )}
                  </EquipmentBlock>

                  {/* Sanitizer */}
                  <EquipmentBlock title="Sanitizer" icon={Zap} missing={!eq.sanitizer}>
                    <EF label="Make / Model" value={[eq.sanitizer?.make, eq.sanitizer?.model].filter(Boolean).join(" ")} />
                    <EF label="Type" value={eq.sanitizer?.type ? SANITIZER_TYPE_LABELS[eq.sanitizer.type] : null} />
                    <EF label="Serial" value={eq.sanitizer?.serial_number} />
                    <EF label="Installed" value={eq.sanitizer?.install_date ? formatDate(eq.sanitizer.install_date) : null} />
                    {eq.sanitizer?.notes && (
                      <div className="mt-1.5 rounded border-l-2 border-slate-300 bg-slate-50 px-2 py-1">
                        <p className="text-xs text-slate-600">{eq.sanitizer.notes}</p>
                      </div>
                    )}
                  </EquipmentBlock>
                </div>

                {/* Automation (full-width) */}
                {eq.automation ? (
                  <EquipmentBlock title="Automation System" icon={Cpu}>
                    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                      <EF label="Make / Model" value={[eq.automation.make, eq.automation.model].filter(Boolean).join(" ")} />
                      <EF label="Serial" value={eq.automation.serial_number} />
                      <EF label="Installed" value={eq.automation.install_date ? formatDate(eq.automation.install_date) : null} />
                    </div>
                  </EquipmentBlock>
                ) : (
                  <EquipmentBlock title="Automation System" icon={Cpu} missing />
                )}

                {/* Additional notes */}
                {eq.additional_notes && (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <p className="mb-1.5 text-xs font-semibold text-slate-500">Additional Notes</p>
                    <p className="text-sm leading-relaxed text-slate-600">{eq.additional_notes}</p>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Access & Entry */}
          <SectionCard
            title="Access & Entry"
            action={
              editingAccess ? (
                <SaveCancelButtons onSave={saveAccess} onCancel={cancelAccess} disabled={saving} />
              ) : (
                <EditButton onClick={startEditAccess} />
              )
            }
          >
            {editingAccess ? (
              <div className="space-y-4">
                <div>
                  <label className={fieldLabelCls}>Gate Code</label>
                  <input
                    type="text"
                    maxLength={20}
                    className={cn(inputCls, "font-mono")}
                    placeholder="e.g. 2847"
                    value={accessDraft.gate_code}
                    onChange={(e) => setAccessDraft((prev) => ({ ...prev, gate_code: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Access Notes</label>
                  <textarea
                    rows={4}
                    maxLength={1000}
                    className={inputCls}
                    placeholder="Dogs on property, parking instructions, key location…"
                    value={accessDraft.access_notes}
                    onChange={(e) => setAccessDraft((prev) => ({ ...prev, access_notes: e.target.value }))}
                  />
                  <p className="mt-1 text-right text-xs text-slate-400">
                    {accessDraft.access_notes.length}/1000
                  </p>
                </div>
              </div>
            ) : (
              <dl className="space-y-4">
                {prop.gate_code && (
                  <div>
                    <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                      <KeyRound className="h-3.5 w-3.5" />
                      Gate Code
                    </dt>
                    <dd className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
                      <span className="font-mono text-base font-bold tracking-widest text-amber-800">
                        {prop.gate_code}
                      </span>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                    <FileText className="h-3.5 w-3.5" />
                    Access Notes
                  </dt>
                  <dd>
                    {prop.access_notes ? (
                      <p className="rounded-lg border border-border bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
                        {prop.access_notes}
                      </p>
                    ) : (
                      <span className="text-sm text-slate-300">No access notes on file.</span>
                    )}
                  </dd>
                </div>
              </dl>
            )}
          </SectionCard>

          {/* Service Notes */}
          <SectionCard
            title="Standing Service Instructions"
            action={
              editingService ? (
                <SaveCancelButtons onSave={saveServiceNotes} onCancel={cancelServiceNotes} disabled={saving} />
              ) : (
                <EditButton onClick={startEditService} />
              )
            }
          >
            {editingService ? (
              <div>
                <textarea
                  rows={5}
                  maxLength={2000}
                  className={inputCls}
                  placeholder="Standing instructions shown on every work order for this property…"
                  value={serviceDraft}
                  onChange={(e) => setServiceDraft(e.target.value)}
                />
                <p className="mt-1 text-right text-xs text-slate-400">{serviceDraft.length}/2000</p>
              </div>
            ) : prop.service_notes ? (
              <p className="rounded-lg border border-border bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
                {prop.service_notes}
              </p>
            ) : (
              <p className="text-sm text-slate-300">No standing instructions on file.</p>
            )}
          </SectionCard>

          {/* Service Schedule */}
          <ServiceScheduleCard propertyId={prop.id} />

          {/* Work Order History */}
          <SectionCard title="Work Order History">
            {relatedWorkOrders.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <ClipboardList className="h-8 w-8 text-slate-200" />
                <p className="text-sm font-medium text-slate-400">No work orders yet</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-slate-50/60">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">WO #</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Title</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Status</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Scheduled</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Tech</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {relatedWorkOrders.map((wo) => {
                      const sc = WO_STATUS[wo.status];
                      return (
                        <tr key={wo.id} className="bg-white hover:bg-slate-50/60">
                          <td className="px-3 py-2.5">
                            <Link
                              href={`/dashboard/work-orders/${wo.id}`}
                              className="font-mono text-xs font-semibold text-brand-600 hover:underline"
                            >
                              {wo.wo_number}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-sm text-slate-700">{wo.title}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", sc.cls)}>
                              {sc.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-sm text-slate-500">
                            {wo.scheduled_date ? (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3 text-slate-400" />
                                {formatDate(wo.scheduled_date)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-slate-500">
                            {wo.assigned_technician_name ? (
                              <span className="flex items-center gap-1.5">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                                  {wo.assigned_technician_name.charAt(0)}
                                </span>
                                {wo.assigned_technician_name}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-slate-300">
                                <User className="h-3 w-3" />
                                Unassigned
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-5 lg:col-span-1">

          {/* Property Details */}
          <SectionCard title="Property Details">
            <dl className="space-y-4">
              <Field label="Full Address">
                <span className="flex items-start gap-1.5">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span>
                    {prop.address_line1}
                    {prop.address_line2 && <>, {prop.address_line2}</>}
                    <br />
                    {prop.city}, {prop.state} {prop.zip}
                  </span>
                </span>
              </Field>
              <Field label="Property ID">
                <span className="font-mono text-xs text-slate-400">{prop.id}</span>
              </Field>
              <Field label="Added">
                {formatDateTime(prop.created_at)}
              </Field>
              <Field label="Last Updated">
                {formatDateTime(prop.updated_at)}
              </Field>
            </dl>
          </SectionCard>

          {/* GHL Contact */}
          {prop.ghl_contact_id ? (
            <SectionCard title="GoHighLevel">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <ExternalLink className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Contact linked</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">{prop.ghl_contact_id}</p>
                  <button
                    type="button"
                    className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View in GHL
                  </button>
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="GoHighLevel">
              <p className="text-sm text-slate-400">No GHL contact linked.</p>
              <button
                type="button"
                className="mt-3 flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600"
              >
                <Building2 className="h-3 w-3" />
                Link GHL Contact
              </button>
            </SectionCard>
          )}

          {/* Service Summary */}
          <SectionCard title="Service Summary">
            <dl className="space-y-4">
              <Field label="Active Work Orders">
                {prop.active_work_order_count > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                    <ClipboardList className="h-3 w-3" />
                    {prop.active_work_order_count} active
                  </span>
                ) : (
                  <span className="text-slate-400">None</span>
                )}
              </Field>
              <Field label="Last Service">
                {prop.last_service_date ? (
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                    {formatDate(prop.last_service_date)}
                  </span>
                ) : (
                  <span className="text-slate-400">No record</span>
                )}
              </Field>
              {prop.last_service_technician_name && (
                <Field label="Last Technician">
                  <span className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                      {prop.last_service_technician_name.charAt(0)}
                    </span>
                    {prop.last_service_technician_name}
                  </span>
                </Field>
              )}
            </dl>
          </SectionCard>

        </div>
      </div>

      {/* New Work Order modal */}
      <NewWorkOrderModal
        open={newWOOpen}
        onClose={() => setNewWOOpen(false)}
        onSuccess={(woNumber) => {
          setNewWOOpen(false);
          setNewWOBanner(`Work order ${woNumber} created successfully.`);
        }}
      />
    </div>
  );
}
