"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Droplets, X, LogOut, User, ChevronRight } from "lucide-react";

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function TechHeader() {
  const { data: session } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);
  const router = useRouter();

  const name      = session?.user?.name || "Technician";
  const firstName = name.split(" ")[0] ?? name;
  const email     = session?.user?.email ?? "";
  const avatarUrl = session?.user?.avatar_url;
  const initials  = getInitials(name);

  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
  });

  return (
    <>
      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
            <Droplets className="h-4 w-4 text-white" />
          </div>
          <span className="text-[13px] font-semibold text-slate-800">ServiceOps</span>
        </div>

        {/* Avatar button */}
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="relative transition-opacity active:opacity-70"
          aria-label="Open profile"
        >
          <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-blue-200 bg-blue-50 text-[14px] font-bold text-blue-600">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          {/* Online indicator */}
          <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
        </button>
      </header>

      {/* ── GREETING BAR ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-[#F4F7FB] px-5 py-3">
        <p className="text-[16px] font-semibold text-slate-900">
          {getGreeting()}, {firstName} 👋
        </p>
        <p className="font-mono text-[12px] text-slate-400">{todayStr}</p>
      </div>

      {/* ── PROFILE DRAWER ──────────────────────────────────────────────── */}
      {profileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setProfileOpen(false)}
          />

          {/* Full-screen panel */}
          <div className="fixed inset-0 z-50 flex flex-col bg-white">
            {/* Panel header */}
            <div className="flex items-center justify-between bg-slate-900 px-5 py-5">
              <p className="text-[16px] font-bold text-white">My Profile</p>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:text-white"
                aria-label="Close profile"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Avatar section */}
            <div className="flex flex-col items-center gap-3 pb-6 pt-8">
              <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-blue-200 bg-blue-50 text-2xl font-bold text-blue-600">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-slate-900">{name}</p>
                <span className="mt-1 inline-block rounded-full bg-brand-50 px-3 py-0.5 text-xs font-semibold text-brand-700">
                  Technician
                </span>
              </div>
            </div>

            {/* Contact info */}
            <div className="mx-5 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50">
              {email && (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <User className="h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Email
                    </p>
                    <p className="text-sm text-slate-700">{email}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="mx-5 mt-4 overflow-hidden rounded-xl border border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  router.push("/tech/today");
                }}
                className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium text-slate-700 transition-colors active:bg-slate-50"
              >
                <span>My Jobs Today</span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            {/* Sign out — pinned to bottom */}
            <div className="mt-auto border-t border-slate-100">
              <button
                type="button"
                onClick={() => void signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center justify-center gap-3 py-5 text-[16px] font-semibold text-red-600 transition-colors active:bg-red-50"
              >
                <LogOut size={20} />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
