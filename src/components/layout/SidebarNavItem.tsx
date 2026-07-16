"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Home,
  Users,
  Users2,
  CalendarCheck,
  CalendarClock,
  FileText,
  Receipt,
  BarChart2,
  BookOpen,
  Settings,
  Sun,
  Contact,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/config/navigation";

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  ClipboardList,
  Home,
  Users,
  Users2,
  CalendarCheck,
  CalendarClock,
  FileText,
  Receipt,
  BarChart2,
  BookOpen,
  Settings,
  Sun,
  Contact,
};

interface SidebarNavItemProps {
  item: NavItem;
  collapsed?: boolean;
}

export function SidebarNavItem({ item, collapsed = false }: SidebarNavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;

  return (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-sidebar-active text-sidebar-text-active"
          : "text-sidebar-text hover:bg-sidebar-hover hover:text-white",
        collapsed && "justify-center px-2"
      )}
      title={collapsed ? item.label : undefined}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-400" />
      )}
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          isActive ? "text-brand-400" : "text-sidebar-text group-hover:text-white"
        )}
      />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {item.href === '/dashboard/reports' &&
            process.env.NEXT_PUBLIC_REPORTING_MODE === 'mock' && (
              <span className="ml-auto shrink-0 rounded-full border border-amber-600/40 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-amber-400">
                demo
              </span>
            )}
        </>
      )}
    </Link>
  );
}
