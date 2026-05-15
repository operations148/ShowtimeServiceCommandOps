import { type NextRequest, NextResponse } from "next/server";
import { requirePermission, getTenantId } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/client";
import type { TechPerformanceData, TechPerformanceRow, TrendPoint, ReportingFilters, DateRangePreset } from "@/types/reporting";
import { defaultDateRange } from "@/config/reporting-mock-data";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requirePermission("canViewReports");
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from") ?? defaultDateRange.from;
  const to   = searchParams.get("to")   ?? defaultDateRange.to;
  const preset = (searchParams.get("preset") ?? "this_month") as DateRangePreset;

  const filters: ReportingFilters = {
    dateRange: { preset, from, to },
  };

  try {
    // ── Technicians with job counts in the date range ────────────────────────
    const { data: techRows, error: techErr } = await db
      .from("users")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("role", "technician")
      .eq("is_active", true);

    if (techErr) throw techErr;

    const techs = (techRows ?? []) as { id: string; name: string }[];

    // ── Work orders in date range ────────────────────────────────────────────
    const { data: wos, error: woErr } = await db
      .from("work_orders")
      .select("id, assigned_technician_id, status, created_at, completed_at, scheduled_date")
      .eq("tenant_id", tenantId)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`);

    if (woErr) throw woErr;

    type WoRow = {
      id: string;
      assigned_technician_id: string | null;
      status: string;
      created_at: string;
      completed_at: string | null;
      scheduled_date: string | null;
    };
    const allWOs = (wos ?? []) as WoRow[];

    // ── Build per-tech stats ─────────────────────────────────────────────────
    const team: TechPerformanceRow[] = techs.map((tech) => {
      const techWOs = allWOs.filter((wo) => wo.assigned_technician_id === tech.id);
      const total      = techWOs.length;
      const completed  = techWOs.filter((wo) => wo.status === "completed").length;
      const inProgress = techWOs.filter((wo) => wo.status === "in_progress").length;
      const estNeeded  = techWOs.filter((wo) => wo.status === "estimate_needed").length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      const completedWithDates = techWOs.filter(
        (wo) => wo.status === "completed" && wo.completed_at && wo.created_at
      );
      const avgDays =
        completedWithDates.length > 0
          ? Math.round(
              completedWithDates.reduce((sum, wo) => {
                const diff =
                  (new Date(wo.completed_at!).getTime() - new Date(wo.created_at).getTime()) /
                  (1000 * 60 * 60 * 24);
                return sum + diff;
              }, 0) / completedWithDates.length
            )
          : 0;

      const initials = tech.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      return {
        userId:          tech.id,
        name:            tech.name,
        avatarInitials:  initials,
        totalAssigned:   total,
        completed,
        inProgress,
        estimateNeeded:  estNeeded,
        completionRate,
        avgDaysToComplete: avgDays,
      };
    });

    // ── Unassigned jobs ──────────────────────────────────────────────────────
    const unassigned = allWOs.filter((wo) => !wo.assigned_technician_id);
    if (unassigned.length > 0) {
      const uCompleted = unassigned.filter((wo) => wo.status === "completed").length;
      team.push({
        userId:           "unassigned",
        name:             "Unassigned",
        avatarInitials:   "—",
        totalAssigned:    unassigned.length,
        completed:        uCompleted,
        inProgress:       unassigned.filter((wo) => wo.status === "in_progress").length,
        estimateNeeded:   unassigned.filter((wo) => wo.status === "estimate_needed").length,
        completionRate:   unassigned.length > 0 ? Math.round((uCompleted / unassigned.length) * 100) : 0,
        avgDaysToComplete: 0,
      });
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const totalAssigned  = allWOs.length;
    const totalCompleted = allWOs.filter((wo) => wo.status === "completed").length;
    const totalInProgress = allWOs.filter((wo) => wo.status === "in_progress").length;
    const avgCompletionRate =
      totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

    // ── Daily trends (jobs completed per day + new jobs per day) ─────────────
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate   = new Date(`${to}T23:59:59`);
    const dayMs    = 86400000;
    const completedTrend: TrendPoint[] = [];
    const newJobsTrend:   TrendPoint[] = [];

    for (let d = new Date(fromDate); d <= toDate; d = new Date(d.getTime() + dayMs)) {
      const dayStr = d.toISOString().slice(0, 10);
      const completedToday = allWOs.filter(
        (wo) => wo.completed_at && wo.completed_at.slice(0, 10) === dayStr
      ).length;
      const createdToday = allWOs.filter(
        (wo) => wo.created_at.slice(0, 10) === dayStr
      ).length;
      completedTrend.push({ date: dayStr, value: completedToday });
      newJobsTrend.push({ date: dayStr, value: createdToday });
    }

    const data: TechPerformanceData = {
      team,
      summary: { totalAssigned, totalCompleted, avgCompletionRate, totalInProgress },
      trends:  { completedJobs: completedTrend, newJobs: newJobsTrend },
      filters,
      generatedAt: new Date().toISOString(),
      dataSource:  "live",
    };

    return NextResponse.json(
      { data, error: null, success: true },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (err) {
    console.error("[api] GET /api/reports/tech-performance failed:", err);
    return NextResponse.json({ data: null, error: "Failed to load tech performance data", success: false }, { status: 500 });
  }
}
