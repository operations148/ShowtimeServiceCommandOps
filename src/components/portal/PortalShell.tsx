"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Home, FileText, GitPullRequestArrow, Receipt, History,
  User, ShieldCheck, LogOut, CalendarPlus, Loader2, Menu, X,
} from "lucide-react";
import type { PortalBranding } from "@/types/portal";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/portal/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/properties", label: "Properties", icon: Home },
  { href: "/portal/estimates", label: "Estimates", icon: FileText },
  { href: "/portal/change-orders", label: "Change Orders", icon: GitPullRequestArrow },
  { href: "/portal/invoices", label: "Invoices", icon: Receipt },
  { href: "/portal/work-history", label: "Work History", icon: History },
  { href: "/portal/profile", label: "Profile", icon: User },
  { href: "/portal/security", label: "Security", icon: ShieldCheck },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [branding, setBranding] = useState<PortalBranding | null>(null);
  const [customer, setCustomer] = useState<{ name: string; email: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const sessionRes = await fetch("/api/portal/session");
      if (!active) return;
      if (sessionRes.status === 401) { router.replace("/portal/login"); return; }
      const sessionJson = (await sessionRes.json()) as { data?: { name: string; email: string } };
      setCustomer(sessionJson.data ?? null);
      const brandRes = await fetch("/api/portal/branding");
      const brandJson = (await brandRes.json()) as { data?: PortalBranding };
      if (active) { setBranding(brandJson.data ?? null); setChecked(true); }
    })();
    return () => { active = false; };
  }, [router]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await fetch("/api/portal/session", { method: "DELETE" });
      // Clear any cached portal responses (safe cache policy — never leave a
      // signed-out device with cached sensitive data).
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } finally {
      router.replace("/portal/login");
    }
  }, [router]);

  if (!checked) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const company = branding?.company_name ?? "Customer Portal";

  const navList = (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
            className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100")}>
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
      {branding?.booking_url && (
        <a href={branding.booking_url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
          <CalendarPlus className="h-4 w-4 shrink-0" /> Book a Visit
        </a>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          {branding?.company_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.company_logo_url} alt={company} className="h-8 max-w-[160px] object-contain" />
          ) : (
            <p className="font-display text-lg font-bold text-slate-900">{company}</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3">{navList}</div>
        <div className="border-t border-slate-200 p-3">
          {customer && <p className="px-3 pb-2 text-xs text-slate-400">{customer.name}<br />{customer.email}</p>}
          <button type="button" onClick={signOut} disabled={signingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          {branding?.company_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.company_logo_url} alt={company} className="h-7 max-w-[130px] object-contain" />
          ) : (
            <p className="font-display text-base font-bold text-slate-900">{company}</p>
          )}
        </div>
        <button type="button" onClick={() => setMobileOpen((v) => !v)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Menu">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {mobileOpen && (
        <div className="border-b border-slate-200 bg-white p-3 lg:hidden">
          {navList}
          <button type="button" onClick={signOut} disabled={signingOut}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out
          </button>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}

export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
export function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
