"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { X, CheckCircle2, Loader2, AlertCircle, MapPin } from "lucide-react";
import { CreatePropertySchema } from "@/lib/validation/property";
import { cn } from "@/lib/utils";

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  error,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Input / select shared styles ─────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50 disabled:text-slate-400";

const errorInputClass = "border-red-300 focus:border-red-400 focus:ring-red-200";

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormValues {
  customer_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  gate_code: string;
  access_notes: string;
  service_notes: string;
}

const DEFAULTS: FormValues = {
  customer_name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  zip: "",
  gate_code: "",
  access_notes: "",
  service_notes: "",
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

// ─── Modal component ──────────────────────────────────────────────────────────

interface NewPropertyModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (propertyId: string, customerName: string) => void;
}

export function NewPropertyModal({ open, onClose, onSuccess }: NewPropertyModalProps) {
  const [values, setValues] = useState<FormValues>(DEFAULTS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ id: string; name: string } | null>(null);

  const customerNameRef = useRef<HTMLInputElement>(null);

  // Body scroll lock + Escape key
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    setTimeout(() => customerNameRef.current?.focus(), 50);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function handleClose() {
    if (isSubmitting) return;
    onClose();
    setTimeout(() => {
      setValues(DEFAULTS);
      setErrors({});
      setSubmitError(null);
      setSuccessInfo(null);
    }, 300);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const payload = {
      customer_name: values.customer_name,
      address_line1: values.address_line1,
      address_line2: values.address_line2 || undefined,
      city: values.city,
      state: values.state,
      zip: values.zip,
      gate_code: values.gate_code || undefined,
      access_notes: values.access_notes || undefined,
      service_notes: values.service_notes || undefined,
      is_active: true,
    };

    const result = CreatePropertySchema.safeParse(payload);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        customer_name: fieldErrors.customer_name?.[0],
        address_line1: fieldErrors.address_line1?.[0],
        address_line2: fieldErrors.address_line2?.[0],
        city:          fieldErrors.city?.[0],
        state:         fieldErrors.state?.[0],
        zip:           fieldErrors.zip?.[0],
        gate_code:     fieldErrors.gate_code?.[0],
        access_notes:  fieldErrors.access_notes?.[0],
        service_notes: fieldErrors.service_notes?.[0],
      });
      if (fieldErrors.customer_name) customerNameRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Failed to create property");
      }

      const json = (await res.json()) as { data: { id: string; customer_name: string } };
      const info = { id: json.data.id, name: json.data.customer_name };
      setSuccessInfo(info);
      onSuccess(info.id, info.name);
      setTimeout(() => handleClose(), 1800);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={handleClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Slide-over drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add Property"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Add Property</h2>
            <p className="mt-0.5 text-sm text-slate-500">Create a new service address record</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {successInfo ? (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-slate-900">Property added</p>
                <p className="mt-1 text-sm font-semibold text-brand-600">{successInfo.name}</p>
                <p className="mt-1 text-sm text-slate-500">Closing in a moment…</p>
              </div>
            </div>
          ) : (
            <form id="new-property-form" onSubmit={handleSubmit} noValidate className="space-y-5 px-6 py-5">

              {/* Submit error banner */}
              {submitError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {submitError}
                </div>
              )}

              {/* Customer Name */}
              <Field label="Customer Name" htmlFor="prop-customer" error={errors.customer_name} required>
                <input
                  ref={customerNameRef}
                  id="prop-customer"
                  type="text"
                  value={values.customer_name}
                  onChange={(e) => set("customer_name", e.target.value)}
                  placeholder="e.g. Jane Rodriguez"
                  maxLength={120}
                  className={cn(inputClass, errors.customer_name && errorInputClass)}
                />
              </Field>

              {/* Address section header */}
              <div className="flex items-center gap-2 pt-1">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Service Address
                </span>
              </div>

              {/* Address Line 1 */}
              <Field label="Street Address" htmlFor="prop-address1" error={errors.address_line1} required>
                <input
                  id="prop-address1"
                  type="text"
                  value={values.address_line1}
                  onChange={(e) => set("address_line1", e.target.value)}
                  placeholder="e.g. 1234 Sunset Blvd"
                  maxLength={200}
                  className={cn(inputClass, errors.address_line1 && errorInputClass)}
                />
              </Field>

              {/* Address Line 2 */}
              <Field label="Apt / Unit / Suite" htmlFor="prop-address2" error={errors.address_line2}>
                <input
                  id="prop-address2"
                  type="text"
                  value={values.address_line2}
                  onChange={(e) => set("address_line2", e.target.value)}
                  placeholder="Optional"
                  maxLength={100}
                  className={cn(inputClass, errors.address_line2 && errorInputClass)}
                />
              </Field>

              {/* City + State + ZIP (3-col) */}
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-2">
                  <Field label="City" htmlFor="prop-city" error={errors.city} required>
                    <input
                      id="prop-city"
                      type="text"
                      value={values.city}
                      onChange={(e) => set("city", e.target.value)}
                      placeholder="Los Angeles"
                      maxLength={100}
                      className={cn(inputClass, errors.city && errorInputClass)}
                    />
                  </Field>
                </div>
                <div className="col-span-1">
                  <Field label="State" htmlFor="prop-state" error={errors.state} required>
                    <input
                      id="prop-state"
                      type="text"
                      value={values.state}
                      onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="CA"
                      maxLength={2}
                      className={cn(inputClass, "uppercase", errors.state && errorInputClass)}
                    />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="ZIP Code" htmlFor="prop-zip" error={errors.zip} required>
                    <input
                      id="prop-zip"
                      type="text"
                      value={values.zip}
                      onChange={(e) => set("zip", e.target.value)}
                      placeholder="90028"
                      maxLength={10}
                      className={cn(inputClass, errors.zip && errorInputClass)}
                    />
                  </Field>
                </div>
              </div>

              {/* Access section header */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Access &amp; Service Notes
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">Optional</span>
              </div>

              {/* Gate Code */}
              <Field
                label="Gate Code"
                htmlFor="prop-gate"
                error={errors.gate_code}
                hint="Short code shown to technicians on arrival"
              >
                <input
                  id="prop-gate"
                  type="text"
                  value={values.gate_code}
                  onChange={(e) => set("gate_code", e.target.value)}
                  placeholder="e.g. #1234"
                  maxLength={20}
                  className={cn(inputClass, "font-mono", errors.gate_code && errorInputClass)}
                />
              </Field>

              {/* Access Notes */}
              <Field
                label="Access Notes"
                htmlFor="prop-access"
                error={errors.access_notes}
                hint="Entry instructions, dogs, parking, neighbor contact, etc."
              >
                <textarea
                  id="prop-access"
                  rows={2}
                  value={values.access_notes}
                  onChange={(e) => set("access_notes", e.target.value)}
                  placeholder="e.g. Side gate on left. Small dog (harmless). Park on street."
                  maxLength={1000}
                  className={cn(inputClass, "resize-none", errors.access_notes && errorInputClass)}
                />
              </Field>

              {/* Service Notes */}
              <Field
                label="Service Notes"
                htmlFor="prop-service"
                error={errors.service_notes}
                hint="Preferences, recurring reminders, special equipment handling"
              >
                <textarea
                  id="prop-service"
                  rows={2}
                  value={values.service_notes}
                  onChange={(e) => set("service_notes", e.target.value)}
                  placeholder="e.g. Prefers service before 10am. Check salt cell after each visit."
                  maxLength={2000}
                  className={cn(inputClass, "resize-none", errors.service_notes && errorInputClass)}
                />
              </Field>

              <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-400">
                <strong className="text-slate-500">Pool equipment</strong> can be added after creation on the property detail page.
              </p>

            </form>
          )}
        </div>

        {/* ── Footer ── */}
        {!successInfo && (
          <div className="flex items-center justify-end gap-3 border-t border-border bg-slate-50/60 px-6 py-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="new-property-form"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Add Property"
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
