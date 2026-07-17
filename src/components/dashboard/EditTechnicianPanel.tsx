"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  Briefcase,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { rolePermissions } from "@/config/roles";
import type { UserRole } from "@/types/technician";

interface Technician {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
}

interface ActiveJob {
  id: string;
  wo_number: string;
  title: string;
  status: string;
}

interface Props {
  tech: Technician;
  onClose: () => void;
  onUpdated: (updated: Technician) => void;
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  estimate_needed: "Estimate Needed",
  needs_follow_up: "Follow Up",
};

const STATUS_COLOR: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  assigned: "bg-cyan-50 text-cyan-700",
  in_progress: "bg-amber-50 text-amber-700",
  estimate_needed: "bg-yellow-50 text-yellow-700",
  needs_follow_up: "bg-orange-50 text-orange-700",
};

export function EditTechnicianPanel({ tech, onClose, onUpdated }: Props) {
  const { data: session } = useSession();
  const role = session?.user?.role as UserRole | undefined;
  // Labor cost is compensation-adjacent (Phase 9, ADR-0016): only roles with
  // canManageJobCosting see or set it. The server enforces the same rail.
  const canSetRate = role ? rolePermissions[role].canManageJobCosting : false;

  // Form state
  const [name, setName]         = useState(tech.name);
  const [email, setEmail]       = useState(tech.email);
  const [phone, setPhone]       = useState(tech.phone ?? "");
  const [isActive, setIsActive] = useState(tech.is_active);

  // Labor rate (dollars in the UI, integer cents on the wire)
  const [rateDollars, setRateDollars]       = useState("");
  const [rateLoadedCents, setRateLoadedCents] = useState<number | null>(null);
  const [newPass, setNewPass]   = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showPassReset, setShowPassReset] = useState(false);
  const [showDanger, setShowDanger]       = useState(false);

  // Save state
  const [saving, setSaving]     = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError]     = useState<string | null>(null);

  // Active jobs
  const [jobs, setJobs]           = useState<ActiveJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // Deactivating
  const [deactivating, setDeactivating] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch active jobs (all non-terminal statuses)
  useEffect(() => {
    async function load() {
      setLoadingJobs(true);
      try {
        const statuses = ['new', 'assigned', 'in_progress', 'estimate_needed', 'needs_follow_up']
        const responses = await Promise.all(
          statuses.map(s =>
            fetch(`/api/work-orders?technician_id=${tech.id}&status=${s}`, { cache: 'no-store' })
              .then(r => r.json())
          )
        )
        const all = responses.flatMap(d => d.data ?? [])
        setJobs(all.slice(0, 5));
      } catch {
        // silent
      } finally {
        setLoadingJobs(false);
      }
    }
    load();
  }, [tech.id]);

  // Load the current labor rate (owner-only endpoint; skip entirely otherwise)
  useEffect(() => {
    if (!canSetRate) return;
    let active = true;
    fetch(`/api/technicians/${tech.id}/rate`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: { hourly_cost_cents: number } } | null) => {
        if (!active || !j?.data) return;
        setRateLoadedCents(j.data.hourly_cost_cents);
        setRateDollars(j.data.hourly_cost_cents > 0 ? (j.data.hourly_cost_cents / 100).toFixed(2) : "");
      })
      .catch(() => { /* field simply stays empty */ });
    return () => { active = false; };
  }, [tech.id, canSetRate]);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving && !deactivating) onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, saving, deactivating]);

  // Close on outside click
  useEffect(() => {
    function handler(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (!saving && !deactivating) onClose();
      }
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [onClose, saving, deactivating]);

  async function handleSave() {
    setFieldErrors({});
    setSaveError(null);

    // Client-side password match check
    if (newPass && newPass !== confirmPass) {
      setFieldErrors({ confirm_password: "Passwords do not match" });
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { name, email, phone, is_active: isActive };
      if (newPass) body.new_password = newPass;

      const res = await fetch(`/api/technicians/${tech.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        else setSaveError(json.error ?? "Failed to save");
        return;
      }

      // Labor rate rides its own owner-only, audited endpoint — only send it
      // when the value actually changed.
      if (canSetRate && rateLoadedCents !== null) {
        const parsed = rateDollars.trim() === "" ? 0 : Math.round(parseFloat(rateDollars) * 100);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed !== rateLoadedCents) {
          const rateRes = await fetch(`/api/technicians/${tech.id}/rate`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hourly_cost_cents: parsed }),
          });
          if (!rateRes.ok) {
            const rateJson = await rateRes.json().catch(() => ({}));
            setSaveError((rateJson as { error?: string }).error ?? "Profile saved, but the labor rate failed to update");
            return;
          }
          setRateLoadedCents(parsed);
        }
      }

      onUpdated(json.data as Technician);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      const res = await fetch(`/api/technicians/${tech.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: false }),
      });
      const json = await res.json();
      if (res.ok) {
        onUpdated(json.data as Technician);
      } else {
        setSaveError(json.error ?? "Failed to deactivate");
      }
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setDeactivating(false);
    }
  }

  const initials = tech.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:w-[420px]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-[#0C1E2E] px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-cyan-400">
              Edit Technician
            </p>
            <h2 className="mt-0.5 text-base font-bold text-white">{tech.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-2 border-b border-slate-100 py-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cyan-100 text-xl font-bold text-cyan-700">
            {initials}
          </div>
          <p className="text-base font-semibold text-slate-900">{tech.name}</p>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Form body */}
        <div className="flex-1 space-y-5 px-6 py-6">
          {saveError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </p>
          )}

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              Changing email changes their login
            </p>
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {/* Labor cost (Phase 9) — owner-only; technicians never see this rail */}
          {canSetRate && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Labor Cost per Hour ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={rateDollars}
                onChange={(e) => setRateDollars(e.target.value)}
                placeholder={rateLoadedCents === null ? "Loading…" : "e.g. 45.00"}
                disabled={rateLoadedCents === null}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50"
              />
              <p className="mt-1 text-xs text-slate-400">
                Burdened internal cost used for job costing — not their pay, never shown to the technician.
                Applies to new time entries only; past entries keep the rate they were logged at.
              </p>
            </div>
          )}

          {/* Status toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-700">
                {isActive ? "Active" : "Inactive"}
              </p>
              <p className="text-xs text-slate-400">
                {isActive
                  ? "Technician can log in and be assigned jobs"
                  : "Technician cannot log in; existing jobs preserved"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                isActive ? "bg-emerald-500" : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  isActive ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Reset password — collapsible */}
          <div className="rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setShowPassReset((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset Password
              {showPassReset ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {showPassReset && (
              <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
                <p className="text-xs text-slate-400">
                  Leave blank to keep the current password
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  {fieldErrors.new_password && (
                    <p className="mt-1 text-xs text-red-600">
                      {fieldErrors.new_password}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  {fieldErrors.confirm_password && (
                    <p className="mt-1 text-xs text-red-600">
                      {fieldErrors.confirm_password}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Assigned jobs */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">Currently assigned jobs</p>
            </div>

            {loadingJobs ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-8 animate-pulse rounded-lg bg-slate-100"
                  />
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">
                No active jobs assigned
              </p>
            ) : (
              <ul className="space-y-1.5">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-700">
                        {job.wo_number}
                      </span>
                      {job.title && (
                        <span className="ml-1.5 truncate text-xs text-slate-500">
                          {job.title}
                        </span>
                      )}
                    </div>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLOR[job.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {STATUS_LABEL[job.status] ?? job.status}
                    </span>
                  </li>
                ))}
                <li>
                  <Link
                    href={`/dashboard/work-orders?technician_id=${tech.id}`}
                    className="block pt-1 text-right text-xs text-brand-600 hover:underline"
                  >
                    View all →
                  </Link>
                </li>
              </ul>
            )}
          </div>

          {/* Danger zone */}
          {tech.is_active && (
            <div className="rounded-lg border border-red-200">
              <button
                type="button"
                onClick={() => setShowDanger((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Danger Zone
                {showDanger ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>

              {showDanger && (
                <div className="space-y-3 border-t border-red-100 px-4 pb-4 pt-3">
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-xs text-amber-800">
                      This will prevent{" "}
                      <span className="font-semibold">{tech.name}</span> from
                      logging in. Their job history will be preserved.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDeactivate}
                    disabled={deactivating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    {deactivating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Deactivate Technician
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
