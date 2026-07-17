"use client";

import { Droplets } from "lucide-react";
import { useSession } from "next-auth/react";
import { adminNavItems, type NavItem } from "@/config/navigation";
import { SidebarNavItem } from "./SidebarNavItem";
import type { UserRole } from "@/types/technician";

interface SidebarProps {
  className?: string;
}

// Feature-flagged nav items (e.g. Platform Admin) only show when their
// NEXT_PUBLIC_ flag is "true". These are inlined at build time, so the lookup
// must be against the literal env name, not a dynamic key.
const FEATURE_FLAG_VALUES: Record<string, boolean> = {
  NEXT_PUBLIC_PLATFORM_ADMIN_ENABLED: process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ENABLED === "true",
};

function isFeatureItemVisible(item: NavItem): boolean {
  if (!item.featureFlagEnv) return true;
  return FEATURE_FLAG_VALUES[item.featureFlagEnv] ?? false;
}

export function Sidebar({ className }: SidebarProps) {
  const { data: session } = useSession();
  const userRole = session?.user?.role as UserRole | undefined;

  const visibleItems = userRole
    ? adminNavItems.filter((item) => item.roles.includes(userRole) && isFeatureItemVisible(item))
    : [];

  const mainNavItems = visibleItems.filter((item) => !item.pinBottom);
  const bottomNavItems = visibleItems.filter((item) => item.pinBottom);
  return (
    <aside
      className={`flex h-full w-60 flex-col ${className ?? ""}`}
      style={{ backgroundColor: "#0C1E2E" }}
    >
      {/* Logo */}
      <div
        className="flex h-16 shrink-0 items-center gap-2.5 px-4"
        style={{ borderBottom: "1px solid #1E3348" }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
          <Droplets className="h-4 w-4 text-white" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-sm font-semibold tracking-tight text-white">
            ServiceOps
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-sidebar-text">
            Command Center
          </span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {mainNavItems.map((item) => (
          <SidebarNavItem key={item.href} item={item} />
        ))}
      </nav>

      {/* Bottom nav (Settings) */}
      <div
        className="shrink-0 px-3 pb-4 pt-2"
        style={{ borderTop: "1px solid #1E3348" }}
      >
        {bottomNavItems.map((item) => (
          <SidebarNavItem key={item.href} item={item} />
        ))}

        {/* Tenant badge */}
        <div className="mt-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: "#132C42" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-text">
            Tenant
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-white">
            Showtime Pool Service
          </p>
        </div>
      </div>
    </aside>
  );
}
