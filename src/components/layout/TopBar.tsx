"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationDropdown } from "./NotificationDropdown";
import { ProfilePanel } from "./ProfilePanel";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/overview":    "Overview",
  "/dashboard/work-orders": "Work Orders",
  "/dashboard/properties":  "Properties",
  "/dashboard/technicians": "Technicians",
  "/dashboard/visits":      "Visits",
  "/dashboard/estimates":   "Estimates",
  "/dashboard/reports":     "Reports",
  "/dashboard/settings":    "Settings",
};

function getPageTitle(pathname: string): string {
  const exact = PAGE_TITLES[pathname];
  if (exact) return exact;
  const match = Object.entries(PAGE_TITLES).find(([key]) =>
    pathname.startsWith(key + "/")
  );
  return match ? match[1] : "Dashboard";
}

interface TopBarProps {
  onMenuClick: () => void;
}

interface UserAvatarButtonProps {
  avatarOverride: string | null;
  onClick: () => void;
}

function UserAvatarButton({ avatarOverride, onClick }: UserAvatarButtonProps) {
  const { data: session } = useSession();
  const avatarUrl = avatarOverride ?? session?.user?.avatar_url ?? null;
  const name = session?.user?.name ?? "User";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const role = session?.user?.role ?? "";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      aria-label="Open profile"
    >
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white overflow-hidden">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={name}
            fill
            className="object-cover"
            sizes="32px"
          />
        ) : (
          initials
        )}
      </div>
      <div className="hidden flex-col leading-tight text-left sm:flex">
        <span className="text-sm font-medium text-slate-900">{name}</span>
        <span className="text-xs text-slate-500 capitalize">
          {role.replace(/_/g, " ").toLowerCase()}
        </span>
      </div>
    </button>
  );
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const [panelOpen, setPanelOpen] = useState(false);
  // Local override so avatar updates immediately after upload without re-login
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);

  function handleAvatarUpdated(url: string | null) {
    setAvatarOverride(url);
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-white px-4 md:px-6">
        {/* Hamburger — mobile only */}
        <button
          type="button"
          onClick={onMenuClick}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg text-slate-500",
            "transition-colors hover:bg-slate-100 hover:text-slate-900",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
            "md:hidden"
          )}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Page title */}
        <h1 className="font-display text-lg font-semibold text-slate-900">
          {title}
        </h1>

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          {/* Notification bell */}
          <NotificationDropdown />

          {/* User avatar — opens ProfilePanel */}
          <UserAvatarButton
            avatarOverride={avatarOverride}
            onClick={() => setPanelOpen(true)}
          />
        </div>
      </header>

      <ProfilePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onAvatarUpdated={handleAvatarUpdated}
        avatarOverride={avatarOverride}
      />
    </>
  );
}
