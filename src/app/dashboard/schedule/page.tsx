import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { getTenantId } from "@/lib/auth/tenant";
import { getTenantTimezone } from "@/lib/db/queries/tenant-settings";
import { localToday } from "@/lib/scheduling/timezone";
import { SchedulePageClient } from "@/components/dashboard/schedule/SchedulePageClient";

export const metadata: Metadata = { title: "Dispatch" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const session = await getServerSession(authOptions);
  // Resolve tenant-local "today" server-side so the calendar anchors correctly
  // regardless of the viewer's browser timezone.
  let today = new Date().toISOString().slice(0, 10);
  try {
    if (session) {
      const tenantId = getTenantId(session);
      const tz = await getTenantTimezone(tenantId);
      today = localToday(tz);
    }
  } catch {
    // fall back to UTC date
  }
  return <SchedulePageClient initialToday={today} />;
}
