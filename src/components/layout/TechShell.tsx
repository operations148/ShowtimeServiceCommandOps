"use client";

import { TechHeader } from "@/components/tech/TechHeader";
import { InstallPromptBanner } from "./InstallPromptBanner";
import { TechLocationReporter } from "@/components/tech/TechLocationReporter";

export function TechShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <TechHeader />
      <InstallPromptBanner />
      {/* Phase 12: foreground-only last-known location reporting (renders nothing) */}
      <TechLocationReporter />
      <main className="flex-1">{children}</main>
    </div>
  );
}
