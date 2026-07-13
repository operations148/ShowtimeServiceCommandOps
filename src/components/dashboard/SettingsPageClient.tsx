"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRef } from "react";
import {
  Building2,
  Zap,
  Users,
  Bell,
  CalendarClock,
  ClipboardList,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Upload,
  Trash2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { cn } from "@/lib/utils";
import type { CompanyProfile } from "@/app/api/settings/company/route";

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-500" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy
        </>
      )}
    </button>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-slate-50/60 px-6 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <Icon className="h-4 w-4 text-brand-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Coming Soon card ─────────────────────────────────────────────────────────

function ComingSoonCard({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm opacity-75">
      <div className="flex items-center gap-3 border-b border-border bg-slate-50/60 px-6 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          <Icon className="h-4 w-4 text-slate-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <div className="px-6 py-4">
        <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Coming in a future update · {phase}
        </span>
      </div>
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-4 sm:items-start">
      <label className="pt-1.5 text-sm font-medium text-slate-700">{label}</label>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400",
        "disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed",
        "transition-colors"
      )}
    />
  );
}

// ─── Read-only status row ─────────────────────────────────────────────────────

function StatusRow({
  label,
  value,
  status,
  copyValue,
  masked,
}: {
  label: string;
  value: string;
  status?: "ok" | "warn" | "neutral";
  copyValue?: string;
  masked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-slate-600 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
        {status === "warn" && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
        <span
          className={cn(
            "text-sm font-medium truncate",
            masked && "font-mono tracking-widest text-slate-400",
            status === "ok" && "text-emerald-700",
            status === "warn" && "text-amber-700",
            status === "neutral" && "text-slate-700",
            !status && "text-slate-700"
          )}
        >
          {masked ? "••••••••••••" : value}
        </span>
        {copyValue && <CopyButton value={copyValue} />}
      </div>
    </div>
  );
}

// ─── Company Profile section ─────────────────────────────────────────────────

function CompanyProfileSection() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [form, setForm] = useState({
    name: "",
    owner_name: "",
    business_phone: "",
    business_email: "",
    service_area: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/company");
      const json = (await res.json()) as { data?: CompanyProfile; error?: string };
      if (json.data) {
        setProfile(json.data);
        setLogoUrl(json.data.logo_url ?? null);
        setForm({
          name:           json.data.name ?? "",
          owner_name:     json.data.owner_name ?? "",
          business_phone: json.data.business_phone ?? "",
          business_email: json.data.business_email ?? "",
          service_area:   json.data.service_area ?? "",
        });
      }
    } catch {
      setError("Failed to load company profile");
    }
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { data?: CompanyProfile; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to save");
      } else if (json.data) {
        setProfile(json.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/settings/company/logo", { method: "POST", body: fd });
      const json = (await res.json()) as { data?: { url: string }; error?: string };
      if (!res.ok) {
        setLogoError(json.error ?? "Upload failed");
      } else if (json.data?.url) {
        setLogoUrl(json.data.url);
      }
    } catch {
      setLogoError("Upload failed. Please try again.");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleLogoRemove() {
    setLogoError(null);
    setUploadingLogo(true);
    try {
      await fetch("/api/settings/company/logo", { method: "DELETE" });
      setLogoUrl(null);
    } catch {
      setLogoError("Failed to remove logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (v: string) => setForm((f) => ({ ...f, [key]: v })),
    };
  }

  return (
    <SettingsSection
      title="Company Profile"
      description="Business information displayed across the app and reports."
      icon={Building2}
    >
      {!profile ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <FieldRow label="Company Name">
            <TextInput {...field("name")} placeholder="Showtime Pool Service" />
          </FieldRow>

          <FieldRow label="Owner Name">
            <TextInput {...field("owner_name")} placeholder="Your name" />
          </FieldRow>

          <FieldRow label="Business Phone">
            <TextInput {...field("business_phone")} type="tel" placeholder="(555) 000-0000" />
          </FieldRow>

          <FieldRow label="Business Email">
            <TextInput {...field("business_email")} type="email" placeholder="hello@example.com" />
          </FieldRow>

          <FieldRow label="Service Area">
            <TextInput {...field("service_area")} placeholder="e.g. Los Angeles County, CA" />
          </FieldRow>

          <FieldRow label="Logo">
            <div className="flex items-center gap-3 flex-wrap">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Company logo" className="h-10 max-w-[160px] rounded border border-slate-200 object-contain bg-white p-1" />
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleLogoUpload}
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600 transition-colors disabled:opacity-50"
              >
                {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadingLogo ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
              </button>
              {logoUrl && !uploadingLogo && (
                <button
                  type="button"
                  onClick={handleLogoRemove}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>
            {logoError && <p className="mt-1.5 text-xs text-red-600">{logoError}</p>}
            <p className="mt-1 text-xs text-slate-400">JPEG, PNG, WebP or SVG · max 5 MB</p>
          </FieldRow>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className={cn(
                "flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm",
                "hover:bg-brand-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </form>
      )}
    </SettingsSection>
  );
}

// ─── GHL Integration section ──────────────────────────────────────────────────

function GHLIntegrationSection() {
  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : "https://serviceops-ghl-workorders.vercel.app"}/api/ghl/webhooks`;
  const locationId = process.env.NEXT_PUBLIC_GHL_LOCATION_ID ?? null;

  return (
    <SettingsSection
      title="GHL Integration"
      description="GoHighLevel connection status and webhook configuration."
      icon={Zap}
    >
      <div className="divide-y divide-border rounded-lg border border-border">
        <StatusRow
          label="GHL Location ID"
          value={locationId ?? "Not configured"}
          status={locationId ? "ok" : "warn"}
        />
        <StatusRow
          label="API Connection"
          value={locationId ? "Connected" : "Not configured"}
          status={locationId ? "ok" : "warn"}
        />
        <StatusRow
          label="Webhook URL"
          value={webhookUrl}
          status="neutral"
          copyValue={webhookUrl}
        />
        <StatusRow
          label="Webhook Secret"
          value=""
          masked
          copyValue={typeof window !== "undefined" ? "" : ""}
          status="neutral"
        />
      </div>

      <p className="mt-4 text-xs text-slate-400">
        GHL credentials are managed via environment variables. Contact your developer to update them.
        {" "}
        <a
          href="https://app.gohighlevel.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-brand-500 hover:underline"
        >
          Open GHL <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </SettingsSection>
  );
}

// ─── Team Members section ─────────────────────────────────────────────────────

function TeamMembersSection() {
  return (
    <SettingsSection
      title="Team Members"
      description="Manage technicians and office staff access."
      icon={Users}
    >
      <p className="mb-4 text-sm text-slate-600">
        Add technicians, update contact info, and manage login credentials from the Technicians page.
      </p>
      <Link
        href="/dashboard/technicians"
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-slate-700",
          "hover:bg-slate-50 hover:border-slate-300 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        )}
      >
        <Users className="h-4 w-4 text-slate-400" />
        Go to Technicians
        <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
      </Link>
    </SettingsSection>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPageClient() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Settings" }]} className="mb-2" />
        <h2 className="font-display text-2xl font-bold text-slate-900">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          App configuration, GHL integration, and company profile.
        </p>
      </div>

      {/* Live sections */}
      <CompanyProfileSection />
      <GHLIntegrationSection />
      <TeamMembersSection />

      {/* Coming Soon sections */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ComingSoonCard
          icon={Bell}
          title="Notification Preferences"
          description="Configure email and in-app alert rules for overdue jobs, sync failures, and new estimates."
          phase="Phase 2"
        />
        <ComingSoonCard
          icon={CalendarClock}
          title="Recurring Schedules"
          description="Define recurring service visit templates that auto-generate work orders on a set schedule."
          phase="Phase 2"
        />
        <ComingSoonCard
          icon={ClipboardList}
          title="Checklist Templates"
          description="Create and manage reusable job checklist templates for each service type."
          phase="Phase 2"
        />
        <ComingSoonCard
          icon={CreditCard}
          title="Billing & Plan"
          description="Manage your subscription plan, billing details, and usage limits."
          phase="Platform feature"
        />
      </div>
    </div>
  );
}
