"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Droplets, X, LogOut, User } from "lucide-react";
import { InstallPromptBanner } from "./InstallPromptBanner";

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function TechShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);

  const name  = session?.user?.name ?? "Technician";
  const email = session?.user?.email ?? "";
  const phone = (session?.user as Record<string, unknown>)?.phone as string | undefined;
  const initials = getInitials(name);

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      {/* Top bar */}
      <header
        className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between px-4"
        style={{ backgroundColor: "#0C1E2E" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-500">
            <Droplets className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-display text-sm font-semibold tracking-tight text-white">
            ServiceOps
          </span>
        </div>

        {/* Avatar — tappable */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex items-center gap-2.5 rounded-full p-1 transition-opacity active:opacity-70"
        >
          <div className="text-right">
            <p className="text-xs font-semibold text-white">{name}</p>
            <p className="text-[10px] font-medium text-slate-400">Technician</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {initials}
          </div>
        </button>
      </header>

      <InstallPromptBanner />

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Profile slide-over */}
      {profileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setProfileOpen(false)}
          />

          {/* Bottom sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white shadow-xl">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-slate-200" />
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={() => setProfileOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="px-6 pb-10 pt-4">
              {/* Avatar + name */}
              <div className="flex flex-col items-center gap-3 pb-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">
                  {initials}
                </div>
                <div className="text-center">
                  <p className="font-display text-lg font-bold text-slate-900">{name}</p>
                  <span className="inline-block rounded-full bg-brand-50 px-3 py-0.5 text-xs font-semibold text-brand-700">
                    Technician
                  </span>
                </div>
              </div>

              {/* Contact details */}
              <div className="mb-6 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50">
                {email && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <User className="h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Email</p>
                      <p className="text-sm text-slate-700">{email}</p>
                    </div>
                  </div>
                )}
                {phone && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z" />
                    </svg>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Phone</p>
                      <p className="text-sm text-slate-700">{phone}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sign out */}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3.5 text-sm font-semibold text-red-600 transition-colors active:bg-red-100"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
