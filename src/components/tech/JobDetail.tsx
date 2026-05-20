"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Key,
  Camera,
  Check,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Loader2,
  X,
  ImageIcon,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Priority,
  ServiceCategory,
  type WorkOrderWithRelations,
} from "@/types/work-order";
import { VisitStatus, type ChecklistItem } from "@/types/visit";
import type { PropertyWithRelations } from "@/types/property";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  wo: WorkOrderWithRelations;
  property: PropertyWithRelations | undefined;
  initialChecklist: ChecklistItem[];
  visitId: string;
  initialPhotoPaths?: string[];
  technicianName?: string;
}

// ─── Photo state ──────────────────────────────────────────────────────────────

type PhotoStatus = "loading" | "uploading" | "done" | "error";

interface PhotoItem {
  localId: string;
  displayUrl: string;   // blob URL (new) or signed URL (existing)
  path: string;         // storage path; empty while uploading
  status: PhotoStatus;
  errorMsg?: string;
}

const MAX_PHOTOS = 10;

// The page moves through a linear state machine.
type Phase =
  | "idle"               // Normal — checklist interactive, actions available
  | "warn_incomplete"    // Complete tapped but items unchecked — show warning
  | "completion_modal"   // Ready to complete — show required message textarea
  | "estimate_prompt"    // Estimate tapped — show notes sheet
  | "submitting"         // API call in flight
  | "done_complete"      // Visit saved as COMPLETED
  | "done_estimate";     // Visit saved with estimate_flagged = true

interface DoneSummary {
  checkedCount: number;
  totalCount: number;
  hasNotes: boolean;
  completedAt: string; // ISO
  completionMessage: string;
}

const QUICK_TAGS = [
  "All chemical levels balanced",
  "Brushed walls and steps",
  "Emptied skimmer baskets",
  "Vacuumed pool floor",
  "Filter backwashed",
  "Equipment checked and operational",
  "Customer contacted",
];

// ─── Label maps ───────────────────────────────────────────────────────────────

const SERVICE_LABEL: Record<ServiceCategory, string> = {
  [ServiceCategory.WEEKLY_POOL_MAINTENANCE]:    "Weekly Maintenance",
  [ServiceCategory.POOL_REPAIR]:                "Pool Repair",
  [ServiceCategory.POOL_INSPECTION_DIAGNOSTIC]: "Inspection / Diagnostic",
  [ServiceCategory.FILTER_CLEANING]:            "Filter Cleaning",
  [ServiceCategory.HEATER_SERVICE]:             "Heater Service",
  [ServiceCategory.EQUIPMENT_INSTALLATION]:     "Equipment Install",
  [ServiceCategory.POOL_REMODEL]:               "Pool Remodel",
  [ServiceCategory.NEW_CONSTRUCTION]:           "New Construction",
  [ServiceCategory.EMERGENCY_SERVICE]:          "Emergency Service",
  [ServiceCategory.OTHER]:                      "Other",
};

const PRIORITY_BADGE: Record<Priority, string> = {
  [Priority.LOW]:    "",
  [Priority.NORMAL]: "",
  [Priority.HIGH]:   "bg-amber-50 text-amber-700 border border-amber-200",
  [Priority.URGENT]: "bg-red-50 text-red-600 border border-red-200",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  [Priority.LOW]:    "",
  [Priority.NORMAL]: "",
  [Priority.HIGH]:   "High Priority",
  [Priority.URGENT]: "Urgent",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCompletedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour:   "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
      {children}
    </h2>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

// ─── Completion screen ────────────────────────────────────────────────────────

function CompletionScreen({ wo, summary }: { wo: WorkOrderWithRelations; summary: DoneSummary }) {
  const allChecked = summary.checkedCount === summary.totalCount;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex flex-col items-center px-6 pb-10 pt-16 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 shadow-[0_0_0_12px_rgba(16,185,129,0.08)]">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={1.5} />
        </div>

        <h1 className="mt-6 font-display text-2xl font-bold text-slate-900">
          Job Complete 🎉
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {wo.wo_number} &middot; {wo.property_customer_name}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          Completed at {formatCompletedAt(summary.completedAt)}
        </p>
      </div>

      {/* Summary cards */}
      <div className="space-y-2 px-6">
        {/* Completion message */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <div className="mb-2 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Completion Summary
            </p>
          </div>
          <p className="text-sm leading-relaxed text-emerald-900">{summary.completionMessage}</p>
          <p className="mt-1.5 text-[11px] text-emerald-600">Admin dashboard has been updated</p>
        </div>

        <div className={cn(
          "flex items-center gap-3 rounded-2xl px-4 py-4",
          allChecked ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"
        )}>
          {allChecked
            ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          }
          <div>
            <p className={cn("text-sm font-semibold", allChecked ? "text-emerald-800" : "text-amber-800")}>
              {summary.checkedCount}/{summary.totalCount} checklist items completed
            </p>
            {!allChecked && (
              <p className="text-xs text-amber-600">
                {summary.totalCount - summary.checkedCount} items were left unchecked
              </p>
            )}
          </div>
        </div>

        <div className={cn(
          "flex items-center gap-3 rounded-2xl px-4 py-4",
          summary.hasNotes ? "bg-emerald-50 border border-emerald-200" : "bg-slate-100 border border-slate-200"
        )}>
          <FileText className={cn("h-5 w-5 shrink-0", summary.hasNotes ? "text-emerald-600" : "text-slate-400")} />
          <p className={cn("text-sm font-semibold", summary.hasNotes ? "text-emerald-800" : "text-slate-500")}>
            {summary.hasNotes ? "Technician notes saved" : "No notes added"}
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pt-8">
        <Link
          href="/tech/today"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-sm font-semibold text-white active:opacity-80"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Today&apos;s Jobs
        </Link>
      </div>
    </div>
  );
}

// ─── Estimate flagged screen ───────────────────────────────────────────────────

function EstimateScreen({ wo, summary }: { wo: WorkOrderWithRelations; summary: DoneSummary }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex flex-col items-center px-6 pb-10 pt-16 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-amber-100 shadow-[0_0_0_12px_rgba(245,158,11,0.08)]">
          <AlertTriangle className="h-12 w-12 text-amber-500" strokeWidth={1.5} />
        </div>

        <h1 className="mt-6 font-display text-2xl font-bold text-slate-900">
          Estimate Flagged
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {wo.wo_number} &middot; {wo.property_customer_name}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          Flagged at {formatCompletedAt(summary.completedAt)}
        </p>
      </div>

      <div className="space-y-2 px-6">
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Office has been notified</p>
            <p className="text-xs text-amber-600">
              An estimate will be prepared and sent to the customer.
            </p>
          </div>
        </div>

        <div className={cn(
          "flex items-center gap-3 rounded-2xl px-4 py-4",
          summary.hasNotes ? "bg-emerald-50 border border-emerald-200" : "bg-slate-100 border border-slate-200"
        )}>
          <FileText className={cn("h-5 w-5 shrink-0", summary.hasNotes ? "text-emerald-600" : "text-slate-400")} />
          <p className={cn("text-sm font-semibold", summary.hasNotes ? "text-emerald-800" : "text-slate-500")}>
            {summary.hasNotes ? "Estimate notes saved" : "No estimate notes added"}
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-slate-400" />
          <p className="text-sm font-semibold text-slate-500">
            {summary.checkedCount}/{summary.totalCount} checklist items completed
          </p>
        </div>
      </div>

      <div className="px-6 pt-8">
        <Link
          href="/tech/today"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-sm font-semibold text-white active:opacity-80"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Today&apos;s Jobs
        </Link>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function JobDetail({ wo, property, initialChecklist, visitId, initialPhotoPaths = [], technicianName }: Props) {
  const [checklist, setChecklist]             = useState<ChecklistItem[]>(initialChecklist);
  const [notes, setNotes]                     = useState("");
  const [estimateNotes, setEstimateNotes]     = useState("");
  const [completionMessage, setCompletionMessage] = useState("");
  const [phase, setPhase]                     = useState<Phase>("idle");
  const [apiError, setApiError]               = useState<string | null>(null);
  const [doneSummary, setDoneSummary]         = useState<DoneSummary | null>(null);
  const [photos, setPhotos]                   = useState<PhotoItem[]>([]);
  const fileInputRef                          = useRef<HTMLInputElement>(null);

  // ── Load existing photos on mount ────────────────────────────────────────

  const loadExistingPhotos = useCallback(async () => {
    if (initialPhotoPaths.length === 0) return;

    // Pre-populate with loading placeholders
    const loading: PhotoItem[] = initialPhotoPaths.map((path) => ({
      localId: path,
      displayUrl: "",
      path,
      status: "loading",
    }));
    setPhotos(loading);

    try {
      const res = await fetch(`/api/visits/${visitId}/photos`);
      const json = (await res.json()) as { data?: { path: string; signedUrl: string }[]; error?: string };
      if (json.data) {
        setPhotos(
          json.data.map((p) => ({
            localId: p.path,
            displayUrl: p.signedUrl,
            path: p.path,
            status: "done",
          }))
        );
      }
    } catch {
      // Don't block the page — just clear the loading state
      setPhotos([]);
    }
  }, [visitId, initialPhotoPaths]);

  useEffect(() => { void loadExistingPhotos(); }, [loadExistingPhotos]);

  // ── Photo upload ──────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected after an error
    e.target.value = "";
    if (!file) return;

    if (photos.length >= MAX_PHOTOS) return;

    const localId = `new-${Date.now()}-${Math.random()}`;
    const objectUrl = URL.createObjectURL(file);

    setPhotos((prev) => [
      ...prev,
      { localId, displayUrl: objectUrl, path: "", status: "uploading" },
    ]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/visits/${visitId}/photos`, {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as { data?: { path: string; signedUrl: string }; error?: string };

      if (!res.ok || !json.data) {
        throw new Error(json.error ?? `Upload failed (${res.status})`);
      }

      setPhotos((prev) =>
        prev.map((p) =>
          p.localId === localId
            ? { ...p, path: json.data!.path, status: "done" }
            : p
        )
      );
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      setPhotos((prev) =>
        prev.map((p) =>
          p.localId === localId
            ? { ...p, status: "error", errorMsg: err instanceof Error ? err.message : "Upload failed" }
            : p
        )
      );
    }
  }

  async function handleRemovePhoto(photo: PhotoItem) {
    if (photo.status === "uploading") return; // can't remove mid-upload

    // Optimistically remove from UI
    setPhotos((prev) => prev.filter((p) => p.localId !== photo.localId));
    if (photo.displayUrl.startsWith("blob:")) {
      URL.revokeObjectURL(photo.displayUrl);
    }

    if (!photo.path) return; // upload failed before path was set — nothing in storage

    try {
      await fetch(`/api/visits/${visitId}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: photo.path }),
      });
    } catch {
      // Silently accept — storage cleanup is best-effort
    }
  }

  const checkedCount  = checklist.filter((i) => i.completed).length;
  const totalCount    = checklist.length;
  const uncheckedCount = totalCount - checkedCount;
  const progressPct   = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
  const allChecked    = uncheckedCount === 0;
  const isLocked      = phase === "submitting" || phase === "done_complete" || phase === "done_estimate";

  const address = [
    property?.address_line1,
    property?.address_line2,
    property?.city && property?.state
      ? `${property.city}, ${property.state} ${property.zip ?? ""}`.trim()
      : undefined,
  ]
    .filter(Boolean)
    .join(", ") || wo.property_address;

  // ── Checklist ───────────────────────────────────────────────────────────────

  function toggleItem(id: string) {
    if (isLocked) return;
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  }

  // ── API call ────────────────────────────────────────────────────────────────

  async function patchVisit(payload: object): Promise<boolean> {
    setApiError(null);
    setPhase("submitting");
    try {
      const res = await fetch(`/api/visits/${visitId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return true;
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Failed to save. Try again.");
      setPhase("idle");
      return false;
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  function handleMarkCompleteTap() {
    if (!allChecked) {
      setPhase("warn_incomplete");
    } else {
      setPhase("completion_modal");
    }
  }

  async function submitComplete() {
    const msg = completionMessage.trim();
    if (msg.length < 10) return; // enforce minimum in modal
    const now = new Date().toISOString();
    const ok = await patchVisit({
      status:             VisitStatus.COMPLETED,
      checklist,
      technician_notes:   notes || undefined,
      estimate_flagged:   false,
      completed_at:       now,
      completion_message: msg,
      completed_by_name:  technicianName ?? undefined,
    });
    if (ok) {
      setDoneSummary({
        checkedCount,
        totalCount,
        hasNotes:          notes.trim().length > 0,
        completedAt:       now,
        completionMessage: msg,
      });
      setPhase("done_complete");
    }
  }

  async function submitEstimate() {
    const now = new Date().toISOString();
    const combinedNotes = [notes, estimateNotes].filter(Boolean).join("\n\n---\n\nEstimate notes:\n");
    const ok = await patchVisit({
      status:           VisitStatus.IN_PROGRESS,
      checklist,
      technician_notes: combinedNotes || undefined,
      estimate_flagged: true,
      completed_at:     now,
    });
    if (ok) {
      setDoneSummary({
        checkedCount,
        totalCount,
        hasNotes:          combinedNotes.trim().length > 0,
        completedAt:       now,
        completionMessage: "",
      });
      setPhase("done_estimate");
    }
  }

  // ── Render done screens ─────────────────────────────────────────────────────

  if (phase === "done_complete" && doneSummary) {
    return <CompletionScreen wo={wo} summary={doneSummary} />;
  }
  if (phase === "done_estimate" && doneSummary) {
    return <EstimateScreen wo={wo} summary={doneSummary} />;
  }

  // ── Render main view ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white px-4 pb-5 pt-4 shadow-sm">
        <Link
          href="/tech/today"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 active:opacity-70"
        >
          <ArrowLeft className="h-4 w-4" />
          Today&apos;s Jobs
        </Link>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-400">{wo.wo_number}</p>
            <h1 className="mt-0.5 font-display text-xl font-bold leading-tight text-slate-900">
              {wo.property_customer_name}
            </h1>
            <p className="mt-0.5 text-sm font-medium text-slate-500">
              {SERVICE_LABEL[wo.service_category]}
            </p>
          </div>

          {PRIORITY_LABEL[wo.priority] && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
                PRIORITY_BADGE[wo.priority]
              )}
            >
              {PRIORITY_LABEL[wo.priority]}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-sm leading-snug text-slate-700">{address}</p>
        </div>
      </div>

      {/* ── API error banner ─────────────────────────────────────────────────── */}
      {apiError && (
        <div className="mx-4 mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Save failed</p>
            <p className="text-xs text-red-600">{apiError}</p>
          </div>
          <button onClick={() => setApiError(null)} className="shrink-0 text-red-400 active:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="space-y-5 px-4 pb-36 pt-5">

        {/* Access Notes */}
        {(property?.gate_code || property?.access_notes) && (
          <div>
            <SectionLabel>Access</SectionLabel>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              {property.gate_code && (
                <div className="mb-2.5 flex items-center gap-2">
                  <Key className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="rounded-lg bg-amber-100 px-2.5 py-0.5 font-mono text-sm font-bold tracking-widest text-amber-800">
                    {property.gate_code}
                  </span>
                  <span className="text-xs font-semibold text-amber-600">Gate code</span>
                </div>
              )}
              {property.access_notes && (
                <p className="text-sm leading-relaxed text-amber-800">{property.access_notes}</p>
              )}
            </div>
          </div>
        )}

        {/* Checklist */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Checklist</SectionLabel>
            <span className={cn(
              "text-xs font-semibold",
              allChecked ? "text-emerald-600" : "text-slate-500"
            )}>
              {checkedCount}/{totalCount}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                allChecked ? "bg-emerald-500" : "bg-brand-500"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <Card className="overflow-hidden">
            {checklist.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                disabled={isLocked}
                className={cn(
                  "flex w-full items-center gap-4 px-4 py-4 text-left",
                  "transition-colors active:bg-slate-50",
                  i > 0 && "border-t border-slate-100",
                  isLocked && "cursor-default"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    item.completed
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-slate-300 bg-white"
                  )}
                >
                  {item.completed && (
                    <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                  )}
                </span>
                <span
                  className={cn(
                    "flex-1 text-sm leading-snug",
                    item.completed ? "text-slate-400 line-through" : "text-slate-800"
                  )}
                >
                  {item.label}
                </span>
              </button>
            ))}
          </Card>
        </div>

        {/* Technician Notes */}
        <div>
          <SectionLabel>Technician Notes</SectionLabel>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-400">
              <FileText className="h-4 w-4" />
              <span className="text-xs font-medium">Visit notes</span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLocked}
              placeholder="Add notes about this visit — chemical readings, issues found, follow-up items…"
              rows={4}
              className={cn(
                "mt-3 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3",
                "text-sm leading-relaxed text-slate-800 placeholder:text-slate-400",
                "focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100",
                "transition-colors disabled:cursor-default disabled:opacity-60"
              )}
            />
          </Card>
        </div>

        {/* Photos */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Photos</SectionLabel>
            <span className="text-xs font-semibold text-slate-500">
              {photos.filter((p) => p.status === "done").length}/{MAX_PHOTOS}
            </span>
          </div>
          <Card className="p-4">
            {/* Hidden file input — triggers camera/gallery */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              onChange={handleFileChange}
              disabled={isLocked}
            />

            {/* Thumbnail grid */}
            {photos.length > 0 && (
              <div className="mb-3 grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <div key={photo.localId} className="relative aspect-square">
                    {photo.status === "loading" || photo.status === "uploading" ? (
                      <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-100">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                      </div>
                    ) : photo.status === "error" ? (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl bg-red-50 px-1">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        <p className="text-center text-[10px] leading-tight text-red-500">
                          {photo.errorMsg ?? "Failed"}
                        </p>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.displayUrl}
                        alt="Job photo"
                        className="h-full w-full rounded-xl object-cover"
                      />
                    )}

                    {/* Remove button */}
                    {!isLocked && photo.status !== "uploading" && photo.status !== "loading" && (
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(photo)}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-white shadow active:opacity-70"
                        aria-label="Remove photo"
                      >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add photo button */}
            {photos.filter((p) => p.status === "done" || p.status === "uploading").length < MAX_PHOTOS && (
              <button
                type="button"
                disabled={isLocked}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-200 py-5",
                  "text-slate-400 transition-colors active:bg-slate-50",
                  "hover:border-brand-300 hover:text-brand-500",
                  "disabled:cursor-default disabled:opacity-60"
                )}
              >
                <Camera className="h-5 w-5" />
                <span className="text-sm font-semibold">
                  {photos.length === 0 ? "Add Photos" : "Add Another"}
                </span>
              </button>
            )}

            {photos.filter((p) => p.status === "done" || p.status === "uploading").length >= MAX_PHOTOS && (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 py-3">
                <ImageIcon className="h-4 w-4 text-slate-400" />
                <p className="text-xs text-slate-400">Maximum {MAX_PHOTOS} photos reached</p>
              </div>
            )}
          </Card>
        </div>

      </div>

      {/* ── Fixed action bar ────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white px-4 pb-6 pt-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">

        {/* Default: two action buttons */}
        {phase === "idle" && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleMarkCompleteTap}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-semibold text-white transition-opacity active:opacity-80"
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark Complete
            </button>
            <button
              type="button"
              onClick={() => setPhase("estimate_prompt")}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-amber-300 bg-amber-50 py-4 text-sm font-semibold text-amber-700 transition-opacity active:opacity-80"
            >
              <AlertTriangle className="h-4 w-4" />
              Estimate Needed
            </button>
          </div>
        )}

        {/* Warning: incomplete checklist items */}
        {phase === "warn_incomplete" && (
          <div>
            <div className="mb-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {uncheckedCount} item{uncheckedCount !== 1 ? "s" : ""} not checked
                </p>
                <p className="text-xs text-amber-600">
                  Are you sure this job is complete?
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="flex flex-1 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white py-4 text-sm font-semibold text-slate-700 active:bg-slate-50"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={() => setPhase("completion_modal")}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-semibold text-white active:opacity-80"
              >
                <CheckCircle2 className="h-4 w-4" />
                Complete Anyway
              </button>
            </div>
          </div>
        )}

        {/* Submitting spinner */}
        {phase === "submitting" && (
          <div className="flex items-center justify-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            <span className="text-sm font-semibold text-slate-600">Saving…</span>
          </div>
        )}

      </div>

      {/* ── Completion message overlay (bottom sheet) ───────────────────────── */}
      {phase === "completion_modal" && (
        <div className="fixed inset-0 z-30 flex items-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setPhase(allChecked ? "idle" : "warn_incomplete")}
          />

          {/* Sheet */}
          <div className="relative w-full rounded-t-3xl bg-white px-4 pb-8 pt-5 shadow-xl">
            {/* Handle */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />

            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">Completion Summary</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Write a brief summary for the office. Required.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhase(allChecked ? "idle" : "warn_incomplete")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick tags */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setCompletionMessage((prev) =>
                      prev ? `${prev}. ${tag}` : tag
                    )
                  }
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 active:bg-emerald-100"
                >
                  + {tag}
                </button>
              ))}
            </div>

            <textarea
              value={completionMessage}
              onChange={(e) => setCompletionMessage(e.target.value)}
              autoFocus
              placeholder="e.g. Serviced pool — balanced chemicals, brushed walls, vacuumed floor, emptied baskets. Equipment all checked and operational."
              rows={4}
              className={cn(
                "mt-3 w-full resize-none rounded-xl border bg-slate-50 px-3 py-3",
                "text-sm leading-relaxed text-slate-800 placeholder:text-slate-400",
                "focus:bg-white focus:outline-none focus:ring-2 transition-colors",
                completionMessage.trim().length > 0 && completionMessage.trim().length < 10
                  ? "border-amber-300 focus:border-amber-400 focus:ring-amber-100"
                  : "border-slate-200 focus:border-emerald-400 focus:ring-emerald-100"
              )}
            />
            <div className="mt-1 flex items-center justify-between">
              <p className={cn(
                "text-xs",
                completionMessage.trim().length < 10 ? "text-amber-600" : "text-slate-400"
              )}>
                {completionMessage.trim().length < 10
                  ? `${10 - completionMessage.trim().length} more character${10 - completionMessage.trim().length !== 1 ? "s" : ""} required`
                  : "Looks good ✓"}
              </p>
              <p className="text-xs text-slate-400">{completionMessage.length}/500</p>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setPhase(allChecked ? "idle" : "warn_incomplete")}
                className="flex flex-1 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white py-4 text-sm font-semibold text-slate-700 active:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitComplete()}
                disabled={completionMessage.trim().length < 10}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-sm font-semibold text-white active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="h-4 w-4" />
                Submit &amp; Complete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Estimate prompt overlay (bottom sheet) ──────────────────────────── */}
      {phase === "estimate_prompt" && (
        <div className="fixed inset-0 z-30 flex items-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setPhase("idle")}
          />

          {/* Sheet */}
          <div className="relative w-full rounded-t-3xl bg-white px-4 pb-8 pt-5 shadow-xl">
            {/* Handle */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />

            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">Flag for Estimate</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Add notes for the office about what work is needed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={estimateNotes}
              onChange={(e) => setEstimateNotes(e.target.value)}
              autoFocus
              placeholder="Describe the issue, parts needed, estimated scope…"
              rows={4}
              className={cn(
                "mt-4 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3",
                "text-sm leading-relaxed text-slate-800 placeholder:text-slate-400",
                "focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-100",
                "transition-colors"
              )}
            />

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="flex flex-1 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white py-4 text-sm font-semibold text-slate-700 active:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEstimate}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-500 py-4 text-sm font-semibold text-white active:opacity-80"
              >
                <AlertTriangle className="h-4 w-4" />
                Flag Estimate
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
