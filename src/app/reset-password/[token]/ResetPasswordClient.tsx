'use client'

import { useState, type FormEvent } from 'react'
import { signOut } from 'next-auth/react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Waves } from 'lucide-react'

const BRAND_CYAN = '#06B6D4'

interface Props {
  token: string
}

export function ResetPasswordClient({ token }: Props) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({})

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    if (password.length < 10) {
      setFieldErrors({ password: 'Password must be at least 10 characters' })
      return
    }
    if (password !== confirmPassword) {
      setFieldErrors({ confirm: 'Passwords do not match' })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const json = await res.json() as { success?: boolean; error?: string }

      if (!res.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.')
        return
      }

      setSuccess(true)
      // Any existing session for this browser is now stale (session_version
      // was bumped server-side) — sign out locally so the next login is clean.
      setTimeout(() => signOut({ callbackUrl: '/login' }), 2500)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
  const errorInputClass = 'border-red-300 focus:border-red-400 focus:ring-red-100'

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0C1E2E]">
            <Waves className="h-5 w-5" style={{ color: BRAND_CYAN }} />
          </div>
          <span className="text-lg font-bold text-slate-900 tracking-tight">ServiceOps</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-[#0C1E2E] px-8 py-6">
            <h1 className="text-xl font-bold text-white">Choose a new password</h1>
            <p className="mt-1 text-sm text-slate-400">This link can only be used once</p>
          </div>

          <div className="px-8 py-7">
            {success ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">Password updated!</p>
                  <p className="mt-1 text-sm text-slate-500">Redirecting you to the login page…</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min 10 characters"
                      maxLength={128}
                      autoFocus
                      className={`${inputClass} pr-10 ${fieldErrors.password ? errorInputClass : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle className="h-3 w-3 shrink-0" />{fieldErrors.password}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirm" className="text-sm font-medium text-slate-700">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="confirm"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Re-enter your password"
                      maxLength={128}
                      className={`${inputClass} pr-10 ${fieldErrors.confirm ? errorInputClass : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.confirm && (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle className="h-3 w-3 shrink-0" />{fieldErrors.confirm}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0066FF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-60"
                >
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Updating…</> : 'Update Password'}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Remembered your password?{' '}
          <a href="/login" className="text-blue-600 hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  )
}
