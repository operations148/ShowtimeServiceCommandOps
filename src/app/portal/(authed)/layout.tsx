import { PortalShell } from "@/components/portal/PortalShell";

export default function AuthedPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
