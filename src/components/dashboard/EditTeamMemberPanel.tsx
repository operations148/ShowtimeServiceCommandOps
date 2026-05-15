'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Mail, Trash2, X } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { ASSIGNABLE_ROLES, ROLE_LABELS, type TeamMember, type TeamMemberRole } from '@/types/team'

interface Props {
  member: TeamMember
  onClose: () => void
  onUpdated: (updated: TeamMember) => void
}

export function EditTeamMemberPanel({ member, onClose, onUpdated }: Props) {
  const { data: session } = useSession()
  const isSelf = session?.user?.id === member.id

  const [name, setName]         = useState(member.name)
  const [email, setEmail]       = useState(member.email)
  const [phone, setPhone]       = useState(member.phone ?? '')
  const [role, setRole]         = useState<TeamMemberRole>(member.role as TeamMemberRole)
  const [isActive, setIsActive] = useState(member.is_active)
  const [newPass, setNewPass]   = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showPassReset, setShowPassReset] = useState(false)
  const [showDanger, setShowDanger]       = useState(false)

  const [saving, setSaving]           = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [deactivating, setDeactivating] = useState(false)
  const [resending, setResending]     = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [deleting, setDeleting]       = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving && !deactivating) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, saving, deactivating])

  useEffect(() => {
    function handler(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (!saving && !deactivating) onClose()
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onClose, saving, deactivating])

  async function handleSave() {
    setFieldErrors({})
    setSaveError(null)

    if (newPass && newPass !== confirmPass) {
      setFieldErrors({ confirm_password: 'Passwords do not match' })
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = { name, email, phone: phone || null, role, is_active: isActive }
      if (newPass) body.new_password = newPass

      const res = await fetch(`/api/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json() as { data?: TeamMember; error?: string; fieldErrors?: Record<string, string> }

      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors)
        else setSaveError(json.error ?? 'Failed to save')
        return
      }

      onUpdated(json.data!)
    } catch {
      setSaveError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    setDeactivating(true)
    try {
      const res = await fetch(`/api/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      })
      const json = await res.json() as { data?: TeamMember; error?: string }
      if (res.ok) onUpdated(json.data!)
      else setSaveError(json.error ?? 'Failed to deactivate')
    } catch {
      setSaveError('Network error. Please try again.')
    } finally {
      setDeactivating(false)
    }
  }

  async function handleResendInvite() {
    setResending(true)
    setResendSuccess(false)
    setSaveError(null)
    try {
      const res = await fetch(`/api/team/${member.id}/resend-invite`, { method: 'POST' })
      const json = await res.json() as { success?: boolean; error?: string }
      if (res.ok) setResendSuccess(true)
      else setSaveError(json.error ?? 'Failed to resend invite')
    } catch {
      setSaveError('Network error. Please try again.')
    } finally {
      setResending(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/team/${member.id}`, { method: 'DELETE' })
      const json = await res.json() as { success?: boolean; error?: string }
      if (res.ok) onClose()
      else setSaveError(json.error ?? 'Failed to delete member')
    } catch {
      setSaveError('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const initials = member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const canAssignableRole = ASSIGNABLE_ROLES.includes(role)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />

      <div
        ref={panelRef}
        className="relative flex h-full w-full flex-col overflow-y-auto bg-white shadow-2xl sm:w-[420px]"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-[#0C1E2E] px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-cyan-400">Edit Team Member</p>
            <h2 className="mt-0.5 text-base font-bold text-white">{member.name}</h2>
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
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
            {initials}
          </div>
          <p className="text-base font-semibold text-slate-900">{member.name}</p>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Form */}
        <div className="flex-1 space-y-5 px-6 py-6">
          {saveError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p>
          )}

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email Address <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <p className="mt-1 text-xs text-slate-400">Changing email changes their login</p>
            {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {/* Role */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Role</label>
            {isSelf ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {ROLE_LABELS[role] ?? role} <span className="text-xs">(cannot change own role)</span>
              </div>
            ) : canAssignableRole ? (
              <select
                value={role}
                onChange={e => setRole(e.target.value as TeamMemberRole)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              >
                {ASSIGNABLE_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                {ROLE_LABELS[role] ?? role}
              </div>
            )}
          </div>

          {/* Status toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-700">{isActive ? 'Active' : 'Inactive'}</p>
              <p className="text-xs text-slate-400">
                {isActive ? 'Member can log in to the dashboard' : 'Member cannot log in; data preserved'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              disabled={isSelf}
              onClick={() => setIsActive(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isActive ? 'bg-emerald-500' : 'bg-slate-200'}`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Reset password */}
          <div className="rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setShowPassReset(v => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset Password
              {showPassReset ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
            </button>
            {showPassReset && (
              <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
                <p className="text-xs text-slate-400">Leave blank to keep the current password</p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">New Password</label>
                  <input
                    type="password"
                    value={newPass}
                    onChange={e => setNewPass(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  {fieldErrors.new_password && <p className="mt-1 text-xs text-red-600">{fieldErrors.new_password}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPass}
                    onChange={e => setConfirmPass(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  {fieldErrors.confirm_password && <p className="mt-1 text-xs text-red-600">{fieldErrors.confirm_password}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Resend invite — only for inactive (pending) members */}
          {!member.is_active && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
              <p className="text-sm font-medium text-blue-900">Pending Invitation</p>
              <p className="mt-0.5 text-xs text-blue-700">This member hasn&apos;t accepted their invite yet. Resend a fresh link to their email.</p>
              {resendSuccess && (
                <p className="mt-2 text-xs font-medium text-emerald-700">Invite sent! Check {member.email}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleResendInvite}
                  disabled={resending}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  {resending ? 'Sending…' : 'Resend Invite'}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          )}

          {/* Danger zone */}
          {member.is_active && !isSelf && (
            <div className="rounded-lg border border-red-200">
              <button
                type="button"
                onClick={() => setShowDanger(v => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Danger Zone
                {showDanger ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {showDanger && (
                <div className="space-y-3 border-t border-red-100 px-4 pb-4 pt-3">
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-xs text-amber-800">
                      This will prevent <span className="font-semibold">{member.name}</span> from logging in. Their data will be preserved.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDeactivate}
                    disabled={deactivating}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    {deactivating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Deactivate Member
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
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
  )
}
