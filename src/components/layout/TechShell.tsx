"use client";

import { TechHeader } from "@/components/tech/TechHeader";
import { InstallPromptBanner } from "./InstallPromptBanner";

export function TechShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <TechHeader />
      <InstallPromptBanner />
      <main className="flex-1">{children}</main>
    </div>
  );
}
