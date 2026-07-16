import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Portal",
  robots: { index: false, follow: false }, // never index the customer portal
  manifest: "/portal-manifest.webmanifest",
};

export default function PortalRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
