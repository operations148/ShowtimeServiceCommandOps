"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  User,
  CalendarDays,
  Clock,
  MapPin,
  Tag,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  Info,
  Building2,
  RefreshCw,
  Camera,
  X,
  Loader2,
  ImageIcon,
  Pencil,
  Search,
  Link2,
  Link2Off,
  FileDown,
  ArrowRightLeft,
} from "lucide-react";
import type { StatusHistoryEntry } from "@/app/api/work-orders/[id]/history/route";
import {
  WorkOrderStatus,
  Priority,
  ServiceCategory,
  EstimateHandoffStatus,
  WORK_ORDER_STATUS_TRANSITIONS,
} from "@/types/work-order";
import type { WorkOrderWithRelations } from "@/types/work-order";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { cn } from "@/lib/utils";

// ─── Display config ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; className: string }> = {
  [WorkOrderStatus.NEW]:             { label: "New",             className: "bg-slate-100 text-slate-600" },
  [WorkOrderStatus.ASSIGNED]:        { label: "Assigned",        className: "bg-blue-50 text-blue-700" },
  [WorkOrderStatus.IN_PROGRESS]:     { label: "In Progress",     className: "bg-brand-50 text-brand-700" },
  [WorkOrderStatus.COMPLETED]:       { label: "Completed",       className: "bg-emerald-50 text-emerald-700" },
  [WorkOrderStatus.NEEDS_FOLLOW_UP]: { label: "Needs Follow-Up", className: "bg-orange-50 text-orange-700" },
  [WorkOrderStatus.ESTIMATE_NEEDED]: { label: "Estimate Needed", className: "bg-amber-50 text-amber-700" },
  [WorkOrderStatus.CANCELLED]:       { label: "Cancelled",       className: "bg-red-50 text-red-500" },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; className: string }> = {
  [Priority.LOW]:    { label: "Low",    className: "bg-slate-100 text-slate-500" },
  [Priority.NORMAL]: { label: "Normal", className: "bg-slate-100 text-slate-600" },
  [Priority.HIGH]:   { label: "High",   className: "bg-orange-50 text-orange-600" },
  [Priority.URGENT]: { label: "Urgent", className: "bg-red-50 text-red-600 font-semibold" },
};

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  [ServiceCategory.WEEKLY_POOL_MAINTENANCE]:    "Weekly Pool Maintenance",
  [ServiceCategory.POOL_REPAIR]:                "Pool Repair",
  [ServiceCategory.POOL_INSPECTION_DIAGNOSTIC]: "Pool Inspection / Diagnostic",
  [ServiceCategory.FILTER_CLEANING]:            "Filter Cleaning",
  [ServiceCategory.HEATER_SERVICE]:             "Heater Service",
  [ServiceCategory.EQUIPMENT_INSTALLATION]:     "Equipment Installation",
  [ServiceCategory.POOL_REMODEL]:               "Pool Remodel",
  [ServiceCategory.NEW_CONSTRUCTION]:           "New Construction",
  [ServiceCategory.EMERGENCY_SERVICE]:          "Emergency Service",
  [ServiceCategory.OTHER]:                      "Other",
};

const ESTIMATE_HANDOFF_CONFIG: Record<EstimateHandoffStatus, { label: string; className: string; description: string }> = {
  [EstimateHandoffStatus.NOT_NEEDED]:   { label: "Not needed",     className: "bg-slate-100 text-slate-500",   description: "" },
  [EstimateHandoffStatus.FLAGGED]:      { label: "Flagged",        className: "bg-amber-50 text-amber-700",    description: "Estimate flagged. Ready to send to GHL." },
  [EstimateHandoffStatus.SENT_TO_GHL]:  { label: "Sent to GHL",   className: "bg-blue-50 text-blue-700",      description: "Estimate request sent to GoHighLevel." },
  [EstimateHandoffStatus.ESTIMATE_SENT]:{ label: "Estimate sent",  className: "bg-purple-50 text-purple-700",  description: "Estimate sent to customer via GHL." },
  [EstimateHandoffStatus.APPROVED]:     { label: "Approved",       className: "bg-emerald-50 text-emerald-700",description: "Customer approved the estimate." },
  [EstimateHandoffStatus.DECLINED]:     { label: "Declined",       className: "bg-red-50 text-red-500",        description: "Customer declined the estimate." },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date(2000, 0, 1, hours, minutes);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-white p-5 shadow-sm", className)}>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
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

// ─── Photo gallery ────────────────────────────────────────────────────────────

interface SignedPhoto {
  path: string;
  signedUrl: string;
  uploadedAt: number;
}

function PhotoGallery({
  visitId,
  technicianName,
}: {
  visitId: string;
  technicianName: string | undefined;
}) {
  const [photos, setPhotos]     = useState<SignedPhoto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lightbox, setLightbox] = useState<SignedPhoto | null>(null);
  const backdropRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/visits/${visitId}/photos`);
        const json = (await res.json()) as { data?: SignedPhoto[]; error?: string };
        if (!cancelled && json.data) setPhotos(json.data);
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [visitId]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox]);

  function formatUploadedAt(ms: number): string {
    if (!ms) return "";
    return new Date(ms).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <SectionCard title="Job Photos">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading photos…
        </div>
      </SectionCard>
    );
  }

  if (photos.length === 0) {
    return (
      <SectionCard title="Job Photos">
        <div className="flex flex-col items-center gap-2 py-6 text-slate-400">
          <Camera className="h-8 w-8" />
          <p className="text-sm">No photos taken for this visit</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard title="Job Photos">
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>
            {photos.length} photo{photos.length !== 1 ? "s" : ""}
            {technicianName ? ` · taken by ${technicianName}` : ""}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {photos.map((photo) => (
            <button
              key={photo.path}
              type="button"
              onClick={() => setLightbox(photo)}
              className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.signedUrl}
                alt="Job photo"
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Lightbox */}
      {lightbox && (
        <div
          ref={backdropRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={(e) => { if (e.target === backdropRef.current) setLightbox(null); }}
        >
          <div className="relative max-h-full max-w-3xl">
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.signedUrl}
              alt="Job photo full size"
              className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
            <div className="mt-2 text-center text-xs text-slate-300">
              {formatUploadedAt(lightbox.uploadedAt)}
              {technicianName ? ` · ${technicianName}` : ""}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PropertyOption {
  id:            string;
  customer_name: string;
  address_line1: string;
  city:          string;
  state:         string;
  zip:           string;
}

interface TechnicianOption {
  id:    string;
  name:  string;
  email: string;
  phone: string | null;
}

export function WorkOrderDetail({
  workOrder,
  visitId,
}: {
  workOrder: WorkOrderWithRelations;
  visitId?: string;
}) {
  const [status, setStatus] = useState<WorkOrderStatus>(workOrder.status);
  const [estimateHandoff, setEstimateHandoff] = useState<EstimateHandoffStatus>(
    workOrder.estimate_handoff_status
  );
  // Toast: { type: "success"|"error"; message: string }
  const [toast, setToast]           = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [ghlSyncFailed, setGhlSyncFailed] = useState<boolean>(workOrder.ghl_sync_failed ?? false);
  const [retrying, setRetrying]     = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Estimate needed dialog
  const [estimateDialogOpen, setEstimateDialogOpen] = useState(false);
  const [estimateNotes, setEstimateNotes]           = useState("");
  const [savingEstimate, setSavingEstimate]         = useState(false);

  // Status history
  const [history, setHistory]           = useState<StatusHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Property linking state
  const [propertyId,       setPropertyId]       = useState<string>(workOrder.property_id ?? "");
  const [propertyName,     setPropertyName]      = useState<string>(workOrder.property_customer_name);
  const [propertyAddress,  setPropertyAddress]   = useState<string>(workOrder.property_address);
  const [linkingProperty,  setLinkingProperty]   = useState(false);
  const [propertySearch,   setPropertySearch]    = useState("");
  const [allProperties,    setAllProperties]     = useState<PropertyOption[]>([]);
  const [loadingProps,     setLoadingProps]      = useState(false);
  const [savingProperty,   setSavingProperty]    = useState(false);

  // Technician assignment state
  const [technicianId,     setTechnicianId]      = useState<string>(workOrder.assigned_technician_id ?? "");
  const [technicianName,   setTechnicianName]    = useState<string>(workOrder.assigned_technician_name ?? "");
  const [linkingTech,      setLinkingTech]       = useState(false);
  const [techSearch,       setTechSearch]        = useState("");
  const [allTechs,         setAllTechs]          = useState<TechnicianOption[]>([]);
  const [loadingTechs,     setLoadingTechs]      = useState(false);
  const [savingTech,       setSavingTech]        = useState(false);

  // Load status history
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrder.id}/history`);
      const json = (await res.json()) as { data?: StatusHistoryEntry[] };
      setHistory(json.data ?? []);
    } catch {
      // Non-fatal
    } finally {
      setHistoryLoading(false);
    }
  }, [workOrder.id]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ type, message: msg });
    setTimeout(() => setToast(null), 3000);
  }

  const handleRetrySync = useCallback(async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry_ghl_sync: true }),
      });
      if (res.ok) {
        setGhlSyncFailed(false);
        showToast("GHL sync retry queued — check Vercel logs for result.");
      } else {
        showToast("Retry request failed. Please try again.", "error");
      }
    } catch {
      showToast("Network error — retry request could not be sent.", "error");
    } finally {
      setRetrying(false);
    }
  }, [workOrder.id]);

  const handleDownloadReport = useCallback(async () => {
    setDownloadingReport(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrder.id}/report`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(j.detail ?? j.error ?? "Report generation failed");
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${workOrder.wo_number}-report.html`;
      a.target   = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to generate report", "error");
    } finally {
      setDownloadingReport(false);
    }
  }, [workOrder.id, workOrder.wo_number]);

  // Load property list when picker opens
  const openPropertyPicker = useCallback(async () => {
    setPropertySearch("");
    setLinkingProperty(true);
    if (allProperties.length > 0) return;
    setLoadingProps(true);
    try {
      const res = await fetch("/api/properties?is_active=true");
      const json = (await res.json()) as { data?: PropertyOption[] };
      setAllProperties(json.data ?? []);
    } catch {
      // silently fail — picker will show empty
    } finally {
      setLoadingProps(false);
    }
  }, [allProperties.length]);

  const handleSelectProperty = useCallback(async (prop: PropertyOption) => {
    setSavingProperty(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: prop.id }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "Save failed");
      }
      setPropertyId(prop.id);
      setPropertyName(prop.customer_name);
      setPropertyAddress(`${prop.address_line1}, ${prop.city}, ${prop.state} ${prop.zip}`);
      setLinkingProperty(false);
      showToast("Property linked successfully.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to link property", "error");
    } finally {
      setSavingProperty(false);
    }
  }, [workOrder.id]);

  const openTechPicker = useCallback(async () => {
    setTechSearch("");
    setLinkingTech(true);
    if (allTechs.length > 0) return;
    setLoadingTechs(true);
    try {
      const res = await fetch("/api/technicians");
      const json = (await res.json()) as { data?: TechnicianOption[] };
      setAllTechs(json.data ?? []);
    } catch {
      // silently fail
    } finally {
      setLoadingTechs(false);
    }
  }, [allTechs.length]);

  const handleSelectTechnician = useCallback(async (tech: TechnicianOption) => {
    setSavingTech(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_technician_id: tech.id }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? "Save failed");
      }
      setTechnicianId(tech.id);
      setTechnicianName(tech.name);
      setLinkingTech(false);
      showToast("Technician assigned successfully.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to assign technician", "error");
    } finally {
      setSavingTech(false);
    }
  }, [workOrder.id]);

  const allowedTransitions = WORK_ORDER_STATUS_TRANSITIONS[status];
  // Estimate flag: show when not already flagged, completed, or cancelled
  const showEstimateButton =
    status !== WorkOrderStatus.ESTIMATE_NEEDED &&
    status !== WorkOrderStatus.COMPLETED &&
    status !== WorkOrderStatus.CANCELLED;
  const isTerminal = status === WorkOrderStatus.CANCELLED;
  const isCompleted = status === WorkOrderStatus.COMPLETED;

  // Real PATCH call for status changes
  const applyStatusChange = useCallback(async (newStatus: WorkOrderStatus) => {
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(json.error ?? "Failed to update status", "error");
        return;
      }
      setStatus(newStatus);
      showToast(`Status updated to ${STATUS_CONFIG[newStatus].label}`);
      void loadHistory();
    } catch {
      showToast("Network error — status not saved", "error");
    } finally {
      setSavingStatus(false);
    }
  }, [workOrder.id, loadHistory]);

  // Estimate needed dialog submit
  const handleFlagEstimate = useCallback(async () => {
    if (!estimateNotes.trim()) return;
    setSavingEstimate(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: WorkOrderStatus.ESTIMATE_NEEDED,
          estimate_handoff_status: EstimateHandoffStatus.FLAGGED,
          estimate_notes: estimateNotes.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(json.error ?? "Failed to flag estimate", "error");
        return;
      }
      setStatus(WorkOrderStatus.ESTIMATE_NEEDED);
      setEstimateHandoff(EstimateHandoffStatus.FLAGGED);
      setEstimateDialogOpen(false);
      setEstimateNotes("");
      showToast("Estimate flagged and sent to GHL");
      void loadHistory();
    } catch {
      showToast("Network error — estimate not saved", "error");
    } finally {
      setSavingEstimate(false);
    }
  }, [workOrder.id, estimateNotes, loadHistory]);

  const statusCfg = STATUS_CONFIG[status];
  const priorityCfg = PRIORITY_CONFIG[workOrder.priority];

  return (
    <div className="mx-auto max-w-7xl space-y-5">

      {/* GHL sync failed banner */}
      {ghlSyncFailed && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-sm text-amber-800">
              GHL sync failed for this job. The status was not updated in GoHighLevel. Retry or update manually.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRetrySync}
            disabled={retrying}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
            {retrying ? "Retrying…" : "Retry Sync"}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm",
          toast.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800"
        )}>
          {toast.type === "success"
            ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            : <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />}
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-auto rounded p-0.5 opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Completed warning */}
      {isCompleted && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>This job is marked complete. Changes will reopen the work order.</span>
        </div>
      )}

      {/* Page header */}
      <div>
        <Breadcrumb
          items={[
            { label: "Work Orders", href: "/dashboard/work-orders" },
            { label: workOrder.wo_number },
          ]}
          className="mb-2"
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-slate-400">
                {workOrder.wo_number}
              </span>
              <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", statusCfg.className)}>
                {statusCfg.label}
              </span>
              <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", priorityCfg.className)}>
                {priorityCfg.label}
              </span>
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
              {workOrder.title}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {workOrder.property_customer_name} · {workOrder.property_address}
            </p>
          </div>

          {/* Action bar */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadReport}
              disabled={downloadingReport}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 disabled:opacity-50"
            >
              {downloadingReport
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <FileDown className="h-4 w-4" />}
              {downloadingReport ? "Generating…" : "Download Report"}
            </button>

          {/* Estimate button */}
          {showEstimateButton && (
            <button
              type="button"
              onClick={() => setEstimateDialogOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-400 px-3.5 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <AlertTriangle className="h-4 w-4" />
              Estimate Needed
            </button>
          )}
          {status === WorkOrderStatus.ESTIMATE_NEEDED && (
            <span className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Estimate Flagged
            </span>
          )}

          {/* Status change dropdown — filters out ESTIMATE_NEEDED (handled by button) */}
          {!isTerminal && (
            <div className="relative">
              <select
                key={status}
                defaultValue=""
                disabled={savingStatus}
                onChange={(e) => {
                  if (e.target.value) void applyStatusChange(e.target.value as WorkOrderStatus);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-50"
                aria-label="Change work order status"
              >
                <option value="" disabled>
                  {savingStatus ? "Saving…" : "Change status…"}
                </option>
                {allowedTransitions
                  .filter((s) => s !== WorkOrderStatus.ESTIMATE_NEEDED)
                  .map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
              </select>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Estimate Needed Dialog */}
      {estimateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { if (!savingEstimate) setEstimateDialogOpen(false); }}
          />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Flag as Estimate Needed</h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Describe what needs to be quoted. This will be sent to GHL.
                </p>
              </div>
            </div>

            <textarea
              value={estimateNotes}
              onChange={(e) => setEstimateNotes(e.target.value)}
              placeholder="e.g. Pump motor is failing and needs replacement. Estimated repair needed before next service visit."
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none"
            />
            {estimateNotes.trim() === "" && savingEstimate === false && (
              <p className="mt-1 text-xs text-slate-400">Required — cannot submit empty</p>
            )}

            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setEstimateDialogOpen(false); setEstimateNotes(""); }}
                disabled={savingEstimate}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleFlagEstimate()}
                disabled={savingEstimate || !estimateNotes.trim()}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                {savingEstimate && <Loader2 className="h-4 w-4 animate-spin" />}
                Flag Estimate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column body */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* ── Left column (main content) ── */}
        <div className="space-y-5 lg:col-span-2">

          {/* Job Info */}
          <SectionCard title="Job Info">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Service Category">
                <span className="flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-slate-400" />
                  {CATEGORY_LABELS[workOrder.service_category]}
                </span>
              </Field>

              {workOrder.completed_at && (
                <Field label="Completed At">
                  {formatDateTime(workOrder.completed_at)}
                </Field>
              )}

              {workOrder.description && (
                <div className="sm:col-span-2">
                  <dt className="mb-1 text-xs font-medium text-slate-400">Description</dt>
                  <dd className="rounded-lg border border-border bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
                    {workOrder.description}
                  </dd>
                </div>
              )}

              {/* GHL links — only shown when present */}
              {(workOrder.ghl_contact_id || workOrder.ghl_opportunity_id) && (
                <div className="sm:col-span-2">
                  <dt className="mb-2 text-xs font-medium text-slate-400">GoHighLevel References</dt>
                  <dd className="flex flex-wrap gap-2">
                    {workOrder.ghl_contact_id && (
                      <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-500">
                        <ExternalLink className="h-3 w-3 text-slate-400" />
                        Contact: {workOrder.ghl_contact_id}
                      </span>
                    )}
                    {workOrder.ghl_opportunity_id && (
                      <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-500">
                        <ExternalLink className="h-3 w-3 text-slate-400" />
                        Opportunity: {workOrder.ghl_opportunity_id}
                      </span>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </SectionCard>

          {/* Property */}
          <SectionCard title="Property">
            {/* ── Linked state ── */}
            {propertyId ? (
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                    <Building2 className="h-4 w-4 text-brand-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{propertyName}</p>
                    <p className="mt-0.5 flex items-start gap-1 text-sm text-slate-500">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {propertyAddress}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    title="Change linked property"
                    onClick={openPropertyPicker}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                  >
                    <Pencil className="h-3 w-3" />
                    Change
                  </button>
                  <Link
                    href={`/dashboard/properties/${propertyId}`}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                  >
                    View
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              /* ── Unlinked state ── */
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-slate-400">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Link2Off className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">No property linked</p>
                    <p className="text-xs text-slate-400">Link a property to see address and equipment details.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openPropertyPicker}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Link Property
                </button>
              </div>
            )}

            {/* ── Property picker ── */}
            {linkingProperty && (
              <div className="mt-4 rounded-xl border border-border bg-slate-50/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500">Select a property</p>
                  <button
                    type="button"
                    onClick={() => setLinkingProperty(false)}
                    className="rounded p-0.5 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Search input */}
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by customer name or address…"
                    autoFocus
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    value={propertySearch}
                    onChange={(e) => setPropertySearch(e.target.value)}
                  />
                </div>

                {/* Results list */}
                <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-white">
                  {loadingProps ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading properties…
                    </div>
                  ) : (() => {
                    const q = propertySearch.toLowerCase();
                    const filtered = allProperties.filter(
                      (p) =>
                        p.customer_name.toLowerCase().includes(q) ||
                        p.address_line1.toLowerCase().includes(q) ||
                        p.city.toLowerCase().includes(q)
                    );
                    if (filtered.length === 0) {
                      return (
                        <div className="px-3 py-4 text-sm text-slate-400">
                          {allProperties.length === 0
                            ? "No properties found. Add one from the Properties page."
                            : "No properties match your search."}
                        </div>
                      );
                    }
                    return filtered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={savingProperty}
                        onClick={() => handleSelectProperty(p)}
                        className={cn(
                          "flex w-full items-start gap-3 border-b border-border px-3 py-2.5 text-left last:border-0",
                          "hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none",
                          p.id === propertyId && "bg-brand-50/60",
                          savingProperty && "opacity-50"
                        )}
                      >
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{p.customer_name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {p.address_line1}, {p.city}, {p.state} {p.zip}
                          </p>
                        </div>
                        {p.id === propertyId && (
                          <span className="ml-auto shrink-0 text-xs font-medium text-brand-600">Current</span>
                        )}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Estimate Handoff — only shown when flagged */}
          {estimateHandoff !== EstimateHandoffStatus.NOT_NEEDED && (
            <SectionCard title="Estimate Handoff">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        ESTIMATE_HANDOFF_CONFIG[estimateHandoff].className
                      )}>
                        {ESTIMATE_HANDOFF_CONFIG[estimateHandoff].label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {ESTIMATE_HANDOFF_CONFIG[estimateHandoff].description}
                    </p>
                    {!workOrder.ghl_opportunity_id && (
                      <p className="mt-1.5 text-xs text-amber-600">
                        No GHL opportunity linked — add one before sending to GHL.
                      </p>
                    )}
                  </div>
                </div>

                {estimateHandoff === EstimateHandoffStatus.FLAGGED && (
                  <button
                    type="button"
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    onClick={async () => {
                      const res = await fetch(`/api/work-orders/${workOrder.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ estimate_handoff_status: EstimateHandoffStatus.SENT_TO_GHL }),
                      });
                      if (res.ok) {
                        setEstimateHandoff(EstimateHandoffStatus.SENT_TO_GHL);
                        showToast("Estimate sent to GHL");
                      } else {
                        showToast("Failed to update GHL status", "error");
                      }
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Send to GHL
                  </button>
                )}
              </div>
            </SectionCard>
          )}

          {/* Job Photos */}
          {visitId && (
            <PhotoGallery
              visitId={visitId}
              technicianName={workOrder.assigned_technician_name ?? undefined}
            />
          )}

          {/* Status History */}
          <SectionCard title="Status History">
            {historyLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 h-6 w-6 animate-pulse rounded-full bg-slate-200 shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ol className="space-y-4">
                {/* Newest history entries first */}
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {entry.previous_status
                          ? `${STATUS_CONFIG[entry.previous_status as WorkOrderStatus]?.label ?? entry.previous_status} → ${STATUS_CONFIG[entry.new_status as WorkOrderStatus]?.label ?? entry.new_status}`
                          : STATUS_CONFIG[entry.new_status as WorkOrderStatus]?.label ?? entry.new_status}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDateTime(entry.changed_at)}
                        {entry.changed_by_name ? ` · by ${entry.changed_by_name}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
                {/* Work order created — always last */}
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <CircleDot className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">Work order created</p>
                    <p className="text-xs text-slate-400">{formatDateTime(workOrder.created_at)}</p>
                  </div>
                </li>
              </ol>
            )}
          </SectionCard>
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-5 lg:col-span-1">

          {/* Assignment */}
          <SectionCard title="Assignment">
            {/* ── Assigned state ── */}
            {technicianId ? (
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {technicianName.charAt(0)}
                  </span>
                  <span className="text-sm font-medium text-slate-800">{technicianName}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    title="Change assigned technician"
                    onClick={openTechPicker}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                  >
                    <Pencil className="h-3 w-3" />
                    Change
                  </button>
                  <Link
                    href="/dashboard/technicians"
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-brand-300 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                  >
                    View
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              /* ── Unassigned state ── */
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <User className="h-4 w-4" />
                  <span className="text-sm">Unassigned</span>
                </span>
                <button
                  type="button"
                  onClick={openTechPicker}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
                >
                  <User className="h-3.5 w-3.5" />
                  Assign Technician
                </button>
              </div>
            )}

            {/* ── Technician picker ── */}
            {linkingTech && (
              <div className="mt-4 rounded-xl border border-border bg-slate-50/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500">Select a technician</p>
                  <button
                    type="button"
                    onClick={() => setLinkingTech(false)}
                    className="rounded p-0.5 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name…"
                    autoFocus
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    value={techSearch}
                    onChange={(e) => setTechSearch(e.target.value)}
                  />
                </div>

                <div className="max-h-52 overflow-y-auto rounded-lg border border-border bg-white">
                  {loadingTechs ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading technicians…
                    </div>
                  ) : (() => {
                    const q = techSearch.toLowerCase();
                    const filtered = allTechs.filter((t) =>
                      t.name.toLowerCase().includes(q) ||
                      t.email.toLowerCase().includes(q)
                    );
                    if (filtered.length === 0) {
                      return (
                        <div className="px-3 py-4 text-sm text-slate-400">
                          {allTechs.length === 0
                            ? "No technicians found. Add one from the Technicians page."
                            : "No technicians match your search."}
                        </div>
                      );
                    }
                    return filtered.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={savingTech}
                        onClick={() => handleSelectTechnician(t)}
                        className={cn(
                          "flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-0",
                          "hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none",
                          t.id === technicianId && "bg-brand-50/60",
                          savingTech && "opacity-50"
                        )}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                          {t.name.charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{t.name}</p>
                          <p className="truncate text-xs text-slate-500">{t.email}</p>
                        </div>
                        {t.id === technicianId && (
                          <span className="ml-auto shrink-0 text-xs font-medium text-brand-600">Current</span>
                        )}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Schedule */}
          <SectionCard title="Schedule">
            <dl className="space-y-4">
              <Field label="Scheduled Date">
                {workOrder.scheduled_date ? (
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                    {formatDate(workOrder.scheduled_date)}
                  </span>
                ) : (
                  <span className="text-slate-400">Not scheduled</span>
                )}
              </Field>

              {(workOrder.scheduled_time_start || workOrder.scheduled_time_end) && (
                <Field label="Time Window">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {workOrder.scheduled_time_start ? formatTime(workOrder.scheduled_time_start) : "—"}
                    {" – "}
                    {workOrder.scheduled_time_end ? formatTime(workOrder.scheduled_time_end) : "—"}
                  </span>
                </Field>
              )}

              <Field label="Created">
                {formatDateTime(workOrder.created_at)}
              </Field>

              <Field label="Last Updated">
                {formatDateTime(workOrder.updated_at)}
              </Field>
            </dl>
          </SectionCard>

        </div>
      </div>
    </div>
  );
}
