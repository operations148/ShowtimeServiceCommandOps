import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth, isTechnicianScoped, getTenantId } from "@/lib/auth/api-auth";
import { upsertTechnicianLocation } from "@/lib/db/queries/geo-context";
import { isTechLocationEnabled } from "@/lib/geo/flags";

export const dynamic = "force-dynamic";

const PingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(100_000).optional(),
  // Client capture time; defaults to server receipt if omitted.
  recorded_at: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/tech/location — a technician posts their OWN last-known position.
//
// A caller can only ever write their own row: technician_id is taken from the
// session, never the body. Non-technician callers with a technician_id (owners
// who are also techs) may post their own; a caller with no technician_id is
// rejected — there's no one to attribute the ping to.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  if (!isTechLocationEnabled()) {
    return NextResponse.json({ data: { disabled: true } });
  }

  const auth = await requireApiAuth();
  if (!auth.ok) return auth.response;
  const tenantId = getTenantId(auth.session);
  const technicianId = auth.session.user.technician_id;

  // Only technicians ping; a non-tech session has no position to report.
  if (!isTechnicianScoped(auth.session) || !technicianId) {
    return NextResponse.json({ error: "Only technicians can post location" }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = PingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid location", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    await upsertTechnicianLocation({
      technicianId,
      tenantId,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracyM: parsed.data.accuracy_m ?? null,
      recordedAt: parsed.data.recorded_at ?? new Date().toISOString(),
    });
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("[api] POST /api/tech/location:", err);
    return NextResponse.json({ error: "Failed to record location" }, { status: 500 });
  }
}
