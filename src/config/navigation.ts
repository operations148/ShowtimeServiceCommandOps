import { UserRole } from "@/types/technician";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: UserRole[];
  pinBottom?: boolean;
  /** When set, the item only shows if this NEXT_PUBLIC_ flag env var is "true". */
  featureFlagEnv?: string;
}

export const adminNavItems: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard/overview",
    icon: "LayoutDashboard",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF, UserRole.READ_ONLY_OWNER],
  },
  {
    label: "Work Orders",
    href: "/dashboard/work-orders",
    icon: "ClipboardList",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF],
  },
  {
    label: "Properties",
    href: "/dashboard/properties",
    icon: "Home",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF],
  },
  {
    label: "Team",
    href: "/dashboard/team",
    icon: "Users2",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN],
  },
  {
    label: "Technicians",
    href: "/dashboard/technicians",
    icon: "Users",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN],
  },
  {
    // Mirrors canManagePortalUsers (platform_owner + tenant_admin only)
    label: "Portal Users",
    href: "/dashboard/portal-users",
    icon: "Contact",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN],
  },
  {
    label: "Dispatch",
    href: "/dashboard/schedule",
    icon: "CalendarClock",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF, UserRole.READ_ONLY_OWNER],
  },
  {
    label: "Visits",
    href: "/dashboard/visits",
    icon: "CalendarCheck",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF, UserRole.READ_ONLY_OWNER],
  },
  {
    label: "Estimates",
    href: "/dashboard/estimates",
    icon: "FileText",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF],
  },
  {
    label: "Invoices",
    href: "/dashboard/invoices",
    icon: "Receipt",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF],
  },
  {
    // Mirrors canViewPricebook: technicians excluded (server enforces regardless)
    label: "Pricebook",
    href: "/dashboard/pricebook",
    icon: "BookOpen",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF, UserRole.READ_ONLY_OWNER],
  },
  {
    label: "Reports",
    href: "/dashboard/reports",
    icon: "BarChart2",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF, UserRole.READ_ONLY_OWNER],
  },
  {
    // Platform admin (Phase 10) — platform_owner only, and only when the
    // kill-switch is on. Cross-tenant surface.
    label: "Platform Admin",
    href: "/dashboard/platform",
    icon: "ShieldAlert",
    roles: [UserRole.PLATFORM_OWNER],
    featureFlagEnv: "NEXT_PUBLIC_PLATFORM_ADMIN_ENABLED",
    pinBottom: true,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: "Settings",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN],
    pinBottom: true,
  },
];

export const techNavItems: NavItem[] = [
  {
    label: "Today's Jobs",
    href: "/tech/today",
    icon: "Sun",
    roles: [UserRole.TECHNICIAN],
  },
];
