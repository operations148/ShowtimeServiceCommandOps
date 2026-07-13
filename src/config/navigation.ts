import { UserRole } from "@/types/technician";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: UserRole[];
  pinBottom?: boolean;
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
    label: "Visits",
    href: "/dashboard/visits",
    icon: "CalendarCheck",
    roles: [UserRole.PLATFORM_OWNER, UserRole.TENANT_ADMIN, UserRole.OFFICE_STAFF],
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
