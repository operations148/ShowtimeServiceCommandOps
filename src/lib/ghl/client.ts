// GHL API client — outbound calls from ServiceOps to GHL.
//
// Auth: GHL Private Integration Token (Bearer header + Version header).
// Retry: up to MAX_RETRIES attempts with exponential backoff + jitter.
//        Retries on 429 and 5xx. Respects Retry-After header on 429.
//        Never retries on 4xx client errors (except 429).
// Logging: every request attempt and response is logged via console.
// Never throws — all paths return GHLResult<T>.

export const GHL_API_BASE =
  process.env.GHL_API_BASE_URL ?? "https://services.leadconnectorhq.com";

// GHL API v2 requires this Version header on every request.
const GHL_API_VERSION = "2021-07-28";

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000; // attempt 2: ~1 s, attempt 3: ~2 s

// HTTP statuses worth retrying (server errors + rate limit).
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// ─── Result type ──────────────────────────────────────────────────────────────

export type GHLResult<T> =
  | { ok: true;  data: T }
  | { ok: false; status: number | null; error: string; retriesUsed: number };

// ─── API data types ───────────────────────────────────────────────────────────

export interface UpdateOpportunityData {
  /** Set "won" when a work order is marked complete. */
  status?: "open" | "won" | "lost" | "abandoned";
  pipelineStageId?: string;
  name?: string;
  monetaryValue?: number;
  assignedTo?: string;
}

export interface CreateTaskData {
  title: string;
  body?: string;
  /** GHL user ID to assign the task to. */
  assignedTo?: string;
  /** ISO 8601 datetime string, e.g. "2026-05-10T09:00:00.000Z". */
  dueDate?: string;
  status?: "incompleted" | "completed";
}

// ─── Minimal response shapes (only fields ServiceOps reads) ──────────────────

export interface GHLOpportunityResponse {
  id: string;
  status: string;
  name: string;
}

export interface GHLTaskResponse {
  id: string;
  title: string;
  status: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff capped at 10 s, with up to 10 % random jitter.
function computeBackoffMs(attempt: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * base * 0.1;
  return Math.min(Math.round(base + jitter), 10_000);
}

// Extract a human-readable error message from a non-OK GHL response body.
async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { message?: string; msg?: string; error?: string };
    return json.message ?? json.msg ?? json.error ?? JSON.stringify(json);
  } catch {
    return await res.text().catch(() => res.statusText);
  }
}

// ─── Core authenticated fetch with retry ─────────────────────────────────────

/**
 * Low-level GHL fetch. Prefer the named helpers (updateOpportunity, createTask)
 * over calling this directly.
 */
export async function ghlFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<GHLResult<T>> {
  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  if (!token) {
    console.error("[ghl/client] GHL_PRIVATE_INTEGRATION_TOKEN is not set — outbound call skipped");
    return {
      ok: false,
      status: null,
      error: "GHL_PRIVATE_INTEGRATION_TOKEN not configured",
      retriesUsed: 0,
    };
  }

  const url = `${GHL_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Version: GHL_API_VERSION,
    "Content-Type": "application/json",
  };

  let lastResult: GHLResult<never> = {
    ok: false,
    status: null,
    error: "No attempts completed",
    retriesUsed: 0,
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    console.log(`[ghl/client] ${method} ${path} (attempt ${attempt}/${MAX_RETRIES})`);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      const latencyMs = Date.now() - t0;
      console.log(`[ghl/client] ${res.status} ${method} ${path} +${latencyMs}ms`);

      if (res.ok) {
        // 204 No Content — treat as success with null data.
        const ct = res.headers.get("content-type") ?? "";
        const data =
          res.status === 204 || !ct.includes("application/json")
            ? (null as T)
            : ((await res.json()) as T);
        return { ok: true, data };
      }

      const errorMsg = await extractErrorMessage(res);
      lastResult = { ok: false, status: res.status, error: errorMsg, retriesUsed: attempt };

      if (!RETRYABLE_STATUSES.has(res.status) || attempt === MAX_RETRIES) {
        console.error(
          `[ghl/client] ${res.status} on ${method} ${path}: ${errorMsg}`
        );
        break;
      }

      // Compute delay — respect Retry-After on 429.
      let delayMs = computeBackoffMs(attempt);
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        if (retryAfter) {
          const seconds = parseInt(retryAfter, 10);
          if (!isNaN(seconds)) delayMs = seconds * 1000;
        }
      }

      console.warn(
        `[ghl/client] ${res.status} on ${method} ${path} — ` +
        `waiting ${delayMs}ms before attempt ${attempt + 1}`
      );
      await sleep(delayMs);

    } catch (err) {
      const latencyMs = Date.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[ghl/client] Network error on ${method} ${path} +${latencyMs}ms: ${message}`
      );

      lastResult = { ok: false, status: null, error: message, retriesUsed: attempt };

      if (attempt === MAX_RETRIES) break;

      const delayMs = computeBackoffMs(attempt);
      console.warn(
        `[ghl/client] Network error — waiting ${delayMs}ms before attempt ${attempt + 1}`
      );
      await sleep(delayMs);
    }
  }

  console.error(
    `[ghl/client] All ${MAX_RETRIES} attempts failed for ${method} ${path}: ${lastResult.error}`
  );
  return lastResult;
}

// ─── Public API methods ───────────────────────────────────────────────────────

/**
 * Update a GHL opportunity.
 * Used when a work order is marked complete → set status "won".
 *
 * GHL API: PUT /opportunities/{opportunityId}
 */
export function updateOpportunity(
  opportunityId: string,
  data: UpdateOpportunityData
): Promise<GHLResult<GHLOpportunityResponse>> {
  return ghlFetch<GHLOpportunityResponse>(
    "PUT",
    `/opportunities/${opportunityId}`,
    data
  );
}

/**
 * Create a task on a GHL opportunity.
 * Used when a technician flags an estimate needed → creates a task for office staff.
 *
 * GHL API: POST /opportunities/{opportunityId}/tasks
 */
export function createTask(
  opportunityId: string,
  taskData: CreateTaskData
): Promise<GHLResult<GHLTaskResponse>> {
  return ghlFetch<GHLTaskResponse>(
    "POST",
    `/opportunities/${opportunityId}/tasks`,
    taskData
  );
}
