import { type NextRequest, NextResponse } from "next/server";
import { requireApiAuth, getTenantId } from "@/lib/auth/api-auth";
import { db } from "@/lib/db/client";

export interface StatusHistoryEntry {
  id: string;
  previous_status: string | null;
  new_status: string;
  changed_by_name: string | null;
  changed_at: string;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);

  const { id } = await params;

  const { data, error } = await db
    .from("work_order_status_history")
    .select("id, previous_status, new_status, changed_by_name, changed_at")
    .eq("work_order_id", id)
    .eq("tenant_id", tenantId)
    .order("changed_at", { ascending: false });

  if (error) {
    console.error("[api] GET /api/work-orders/[id]/history:", error.message);
    return NextResponse.json({ data: [] });
  }

  return NextResponse.json({ data: data ?? [] });
}
