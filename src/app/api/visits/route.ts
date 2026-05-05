import { type NextRequest, NextResponse } from "next/server";
import { CreateVisitSchema } from "@/lib/validation/visit";
import { listVisits, createVisit } from "@/lib/mock-data/visit-store";
import { VisitStatus } from "@/types/visit";

// ---------------------------------------------------------------------------
// GET /api/visits
// Query params:
//   tenant_id        — string  (defaults to "tenant-showtime")
//   work_order_id    — string  filter by work order
//   property_id      — string  filter by property
//   technician_id    — string  filter by assigned tech
//   status           — VisitStatus enum value
//   estimate_flagged — "true" | "false"
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const tenantId       = searchParams.get("tenant_id")      ?? undefined;
  const workOrderId    = searchParams.get("work_order_id")   ?? undefined;
  const propertyId     = searchParams.get("property_id")     ?? undefined;
  const technicianId   = searchParams.get("technician_id")   ?? undefined;
  const rawStatus      = searchParams.get("status")          ?? undefined;
  const rawEstimate    = searchParams.get("estimate_flagged") ?? undefined;

  // Validate status param
  let statusFilter: VisitStatus | undefined;
  if (rawStatus !== undefined) {
    if (!Object.values(VisitStatus).includes(rawStatus as VisitStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status value: "${rawStatus}" — must be one of: ${Object.values(VisitStatus).join(", ")}`,
        },
        { status: 400 }
      );
    }
    statusFilter = rawStatus as VisitStatus;
  }

  // Validate estimate_flagged param
  let estimateFlaggedFilter: boolean | undefined;
  if (rawEstimate !== undefined) {
    if (rawEstimate === "true") {
      estimateFlaggedFilter = true;
    } else if (rawEstimate === "false") {
      estimateFlaggedFilter = false;
    } else {
      return NextResponse.json(
        { error: `Invalid estimate_flagged value: "${rawEstimate}" — must be "true" or "false"` },
        { status: 400 }
      );
    }
  }

  const visits = listVisits({
    tenant_id:       tenantId,
    work_order_id:   workOrderId,
    property_id:     propertyId,
    technician_id:   technicianId,
    status:          statusFilter,
    estimate_flagged: estimateFlaggedFilter,
  });

  return NextResponse.json({ data: visits, total: visits.length });
}

// ---------------------------------------------------------------------------
// POST /api/visits
// Body: CreateVisitInput (validated via Zod)
// tenant_id is taken from session in production; hardcoded for mock phase.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = CreateVisitSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const created = createVisit(result.data);
  return NextResponse.json({ data: created }, { status: 201 });
}
