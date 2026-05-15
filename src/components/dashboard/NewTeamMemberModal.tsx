'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Mail, X } from 'lucide-react'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type TeamMemberRole } from '@/types/team'

const Schema = z.object({
  name:  z.string().min(2, 'Name must be at least 2 characters').max(120).transform(v => v.trim()),
  email: z.string().email('Enter a valid email address').transform(v => v.toLowerCase().trim()),
  phone: z.string().max(30).optional(),
  role:  z.enum(['tenant_admin', 'office_staff', 'read_only_owner'] as const),
})

type FormValues = {
  name: string
  email: string
  phone: string
  role: TeamMemberRole
}

const DEFAULTS: FormValues = { name: '', email: '', phone: '', role: 'office_staff' }

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50 disabled:text-slate-400'
const errorInputClass = 'border-red-300 focus:border-red-400 focus:ring-red-200'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (name: string) => void
}

export function NewTeamMemberModal({ open, onClose, onSuccess }: Props) {
  const [values, setValues] = useState<FormValues>(DEFAULTS)
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successName, setSuccessName] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    setTimeout(() => nameRef.current?.focus(), 50)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues(v => ({ ...v, [key]: value }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  function handleClose() {
    if (isSubmitting) return
    onClose()
    setTimeout(() => {
      setValues(DEFAULTS)
      setErrors({})
      setSubmitError(null)
      setSuccessName(null)
    }, 300)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const result = Schema.safeParse(values)
    if (!result.success) {
      const fe = result.error.flatten().fieldErrors
      setErrors({
        name:  fe.name?.[0],
        email: fe.email?.[0],
        phone: fe.phone?.[0],
        role:  fe.role?.[0],
      })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      })
      const json = await res.json() as { data?: { name: string }; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed to send invitation')
      setSuccessName(json.data!.name)
      onSuccess(json.data!.name)
      setTimeout(() => handleClose(), 2500)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div
        aria-hidden="true"
        onClick={handleClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite Team Member"
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Invite Team Member</h2>
            <p className="mt-0.5 text-sm text-slate-500">They'll receive an email to set their own password</p>
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {successName ? (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <Mail className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-slate-900">Invitation sent!</p>
                <p className="mt-1 text-sm font-semibold text-brand-600">{successName}</p>
                <p className="mt-1 text-sm text-slate-500">They'll receive an email to set their password and activate their account.</p>
              </div>
            </div>
          ) : (
            <form id="new-member-form" onSubmit={handleSubmit} noValidate className="space-y-5 px-6 py-5">
              {submitError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {submitError}
                </div>
              )}

              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tm-name" className="text-sm font-medium text-slate-700">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  ref={nameRef}
                  id="tm-name"
                  type="text"
                  value={values.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Sarah Mitchell"
                  maxLength={120}
                  className={cn(inputClass, errors.name && errorInputClass)}
                />
                {errors.name && <p className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3 w-3 shrink-0" />{errors.name}</p>}
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tm-email" className="text-sm font-medium text-slate-700">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  id="tm-email"
                  type="email"
                  value={values.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="e.g. sarah@showtimepools.com"
                  maxLength={200}
                  className={cn(inputClass, errors.email && errorInputClass)}
                />
                {errors.email
                  ? <p className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3 w-3 shrink-0" />{errors.email}</p>
                  : <p className="text-xs text-slate-400">An invite link will be emailed to this address</p>
                }
              </div>

              {/* Phone */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tm-phone" className="text-sm font-medium text-slate-700">Phone</label>
                <input
                  id="tm-phone"
                  type="tel"
                  value={values.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="e.g. (619) 555-0123"
                  maxLength={30}
                  className={cn(inputClass, errors.phone && errorInputClass)}
                />
                {errors.phone && <p className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="h-3 w-3 shrink-0" />{errors.phone}</p>}
              </div>

              {/* Role */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tm-role" className="text-sm font-medium text-slate-700">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  id="tm-role"
                  value={values.role}
                  onChange={e => set('role', e.target.value as TeamMemberRole)}
                  className={cn(inputClass, errors.role && errorInputClass)}
                >
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">{ROLE_DESCRIPTIONS[values.role]}</p>
              </div>

              {/* Info box */}
              <div className="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  A secure invite link will be emailed to <strong>{values.email || 'the address above'}</strong>. They'll set their own password when they accept. The link expires in 7 days.
                </p>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        {!successName && (
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
              form="new-member-form"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-60"
            >
              {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Mail className="h-4 w-4" />Send Invitation</>}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
