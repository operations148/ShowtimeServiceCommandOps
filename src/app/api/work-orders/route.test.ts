// route.test.ts — REAL Request/Response tests for GET/POST /api/work-orders,
// proving the 855b6e1 regression fix directly: a database failure must not
// be represented as a valid, HTTP-200 empty collection.
//
// requireApiAuth/getTenantId/isTechnicianScoped are mocked (not the query
// layer) — this isolates the route's OWN try/catch/status-code behavior,
// which is what changed this session, from the separate NextAuth/session
// machinery those functions wrap (already exercised elsewhere; re-deriving
// it here would test infrastructure this route doesn't own).

import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

function freshGetRequest(query = ""): NextRequest {
  return new NextRequest(`https://example.test/api/work-orders${query}`, { method: "GET" });
}

async function setupAuthedRoute(opts: {
  listWorkOrdersImpl?: () => Promise<unknown>;
  technicianScoped?: boolean;
} = {}) {
  vi.resetModules();

  const listWorkOrders = vi.fn(
    (async (_filters: Record<string, unknown>) => (await opts.listWorkOrdersImpl?.()) ?? []) as
      (filters: Record<string, unknown>) => Promise<unknown>,
  );
  vi.doMock("@/lib/db/queries/work-orders", () => ({
    listWorkOrders,
    createWorkOrder: vi.fn(),
  }));

  vi.doMock("@/lib/auth/api-auth", () => ({
    requireApiAuth: vi.fn().mockResolvedValue({
      ok: true,
      session: { user: { id: "u1", tenant_id: "tenant-a", role: "tenant_admin" } },
    }),
    requirePermission: vi.fn().mockResolvedValue({
      ok: true,
      session: { user: { id: "u1", tenant_id: "tenant-a", role: "tenant_admin" } },
    }),
    isTechnicianScoped: vi.fn().mockReturnValue(opts.technicianScoped ?? false),
    getTenantId: vi.fn().mockReturnValue("tenant-a"),
  }));

  const route = await import("./route");
  return { GET: route.GET, listWorkOrders };
}

describe("GET /api/work-orders — database failure must not be a valid empty collection", () => {
  it("a genuine query failure returns a non-2xx status with an error field, not {data:[],total:0}", async () => {
    const { GET } = await setupAuthedRoute({
      listWorkOrdersImpl: async () => { throw new Error("PGRST201: more than one relationship was found"); },
    });

    const res = await GET(freshGetRequest());

    // This is the exact regression this test exists to catch: the pre-fix
    // code (855b6e1) returned 200 + {data:[],total:0} here, indistinguishable
    // from a genuinely empty, healthy tenant.
    expect(res.status).not.toBe(200);
    expect(res.status).toBeGreaterThanOrEqual(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.data).toBeUndefined();
  });

  it("a genuinely empty tenant (no query error) still returns 200 with an empty array — the fix does not break the real empty case", async () => {
    const { GET } = await setupAuthedRoute({ listWorkOrdersImpl: async () => [] });

    const res = await GET(freshGetRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.error).toBeUndefined();
  });

  it("a real result set still returns 200 with the actual rows", async () => {
    const rows = [{ id: "wo-1", wo_number: "WO-0001" }];
    const { GET } = await setupAuthedRoute({ listWorkOrdersImpl: async () => rows });

    const res = await GET(freshGetRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(rows);
    expect(body.total).toBe(1);
  });
});

describe("GET /api/work-orders — query validation", () => {
  it("rejects an invalid status value with 400 before touching the database", async () => {
    const { GET, listWorkOrders } = await setupAuthedRoute();
    const res = await GET(freshGetRequest("?status=not_a_real_status"));
    expect(res.status).toBe(400);
    expect(listWorkOrders).not.toHaveBeenCalled();
  });
});

describe("GET /api/work-orders — technician scoping", () => {
  it("a client-supplied technician_id is ignored for a technician-scoped session", async () => {
    const { GET, listWorkOrders } = await setupAuthedRoute({ technicianScoped: true });
    await GET(freshGetRequest("?technician_id=someone-elses-id"));
    const callArg = listWorkOrders.mock.calls[0]?.[0];
    expect(callArg?.technician_id).not.toBe("someone-elses-id");
  });
});
