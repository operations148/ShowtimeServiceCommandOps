// normalize-payload.ts
//
// Normalizes an inbound GHL webhook body into the nested shape the dispatch
// handler and work-order factory expect.
//
// GHL's "Custom Webhook" action sends a FLAT key/value body whose exact key
// names vary between workflow templates and GHL versions, while our handlers
// read a nested shape (pipelineStage.name, contact.id). This module is the one
// place that reconciles the two, and it is deliberately pure so the mapping can
// be regression-tested without a network or database.
//
// Two rules matter more than the key aliasing:
//
//   1. An unresolved merge tag is NOT a value. If a workflow references a field
//      that does not exist on the triggering record, GHL posts the literal
//      "{{contact.id}}" rather than omitting the key. Treating that as a real
//      ID would write garbage into the database, so it is normalized to absent.
//
//   2. Missing means missing. A blank contact id was previously normalized to
//      the empty string "", which reads as "present" to a truthiness check and
//      pushed the failure further down the stack. Absent fields stay undefined.

import type { GHLWebhookPayload } from "@/types/ghl";

/** True when a value is an unreplaced GHL merge tag, e.g. "{{contact.id}}". */
export function isUnresolvedMergeTag(value: string): boolean {
  return value.includes("{{") || value.includes("}}");
}

/**
 * Trims, strips surrounding quotes GHL sometimes adds, and returns null for
 * anything that is not a usable value (blank, or an unresolved merge tag).
 */
export function cleanValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return null;
  const trimmed = String(value).trim().replace(/^["']|["']$/g, "").trim();
  if (!trimmed) return null;
  if (isUnresolvedMergeTag(trimmed)) return null;
  return trimmed;
}

/**
 * Returns the first usable value among `keys`, checking both the top level and
 * an optional nested `data` envelope (some GHL templates wrap the body).
 */
export function getField(payload: Record<string, unknown>, ...keys: string[]): string | null {
  const nested = payload.data as Record<string, unknown> | undefined;
  for (const key of keys) {
    const top = cleanValue(payload[key]);
    if (top !== null) return top;
    if (nested && typeof nested === "object") {
      const inner = cleanValue(nested[key]);
      if (inner !== null) return inner;
    }
  }
  return null;
}

/**
 * Parses a GHL date into "YYYY-MM-DD". Handles ISO timestamps, date-only
 * strings and US "MM/DD/YYYY". Returns null when unparseable.
 */
export function parseAppointmentDate(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return null;
}

/** Extracts "HH:MM" from an ISO datetime. Returns null when not a timestamp. */
export function parseAppointmentTime(raw: string | null): string | null {
  if (!raw) return null;
  const match = /T(\d{2}:\d{2})/.exec(raw.trim());
  return match ? match[1]! : null;
}

/**
 * The real pipeline-stage name for a payload, or null when there isn't one.
 *
 * `pipelineStage` exists on only some members of the GHLWebhookPayload union,
 * so reading it directly does not typecheck; the `in` guard narrows safely.
 *
 * Returns null — never "" and never a placeholder — when the stage is absent
 * or blank. normalizeGHLPayload() builds `{ id, name: "" }` when it found a
 * stage ID but no stage name, and an empty name is not a stage.
 *
 * This is the single source for the `stage` field in structured logs. It must
 * never be substituted with outcome.detail, which is a reason string for most
 * outcomes.
 */
export function stageNameOf(payload: GHLWebhookPayload): string | null {
  if (!("pipelineStage" in payload)) return null;
  const stage = payload.pipelineStage as { name?: unknown } | undefined;
  const name = typeof stage?.name === "string" ? stage.name.trim() : "";
  return name === "" ? null : name;
}

export interface NormalizedPayload {
  payload: GHLWebhookPayload;
  /** Field-presence booleans for safe structured logging — never the values. */
  presence: {
    locationId: boolean;
    opportunityId: boolean;
    contactId: boolean;
    stageName: boolean;
    stageId: boolean;
  };
  /** Top-level key names that arrived, for diagnosing workflow misconfiguration. */
  receivedKeys: string[];
}

/**
 * Normalizes a raw parsed webhook body. Never throws — validation of whether
 * the required fields are actually present belongs to the dispatch layer, which
 * can turn absence into a typed outcome.
 */
export function normalizeGHLPayload(raw: Record<string, unknown>): NormalizedPayload {
  const receivedKeys = Object.keys(raw);
  const out: Record<string, unknown> = { ...raw };

  out.type = getField(raw, "type") ?? "";

  const existingStage = raw.pipelineStage as { id?: unknown; name?: unknown } | undefined;
  const stageName =
    getField(raw, "pipelineStageName", "pipeline_stage_name", "stageName") ??
    cleanValue(existingStage?.name);
  const stageId =
    getField(raw, "pipelineStageId", "pipeline_stage_id", "stageId") ??
    cleanValue(existingStage?.id);

  // Only attach pipelineStage when something usable was found — an object of
  // empty strings would look present to downstream truthiness checks.
  if (stageName || stageId) {
    out.pipelineStage = { id: stageId ?? "", name: stageName ?? "" };
  } else {
    delete out.pipelineStage;
  }

  const existingContact = raw.contact as Record<string, unknown> | undefined;
  const contactId =
    getField(raw, "contactId", "contact_id") ?? cleanValue(existingContact?.id);
  const contactName =
    getField(raw, "name", "contactName", "fullName", "contact_name", "firstName") ??
    cleanValue(existingContact?.name);
  const contactEmail =
    getField(raw, "contactEmail", "email") ?? cleanValue(existingContact?.email);
  const contactPhone =
    getField(raw, "contactPhone", "phone") ?? cleanValue(existingContact?.phone);

  if (contactId || contactName || contactEmail || contactPhone) {
    out.contact = {
      ...(contactId ? { id: contactId } : {}),
      ...(contactName ? { name: contactName } : {}),
      ...(contactEmail ? { email: contactEmail } : {}),
      ...(contactPhone ? { phone: contactPhone } : {}),
    };
  } else {
    delete out.contact;
  }

  // Appointment date/time — stamped as private fields the factory reads
  // directly, bypassing the env-var-keyed customFields lookup chain.
  const appointmentStart = getField(
    raw,
    "appointmentStartDateTime",
    "appointmentStartTime",
    "appointmentStart",
    "appointmentS",
    "appointment_start",
    "appointmentDate",
    "appointment_only_start_date",
  );
  const appointmentDate = parseAppointmentDate(appointmentStart);
  const appointmentTime = parseAppointmentTime(appointmentStart);
  const appointmentId = getField(raw, "appointmentId", "appointment_id", "calendarEventId", "eventId");

  if (appointmentDate) out._appointmentDate = appointmentDate;
  if (appointmentTime) out._appointmentTime = appointmentTime;
  if (appointmentId) out._appointmentId = appointmentId;

  const locationId = getField(raw, "locationId", "location_id");
  if (locationId) out.locationId = locationId;
  else delete out.locationId;

  const opportunityId = getField(raw, "id", "opportunityId", "opportunity_id");
  if (opportunityId) out.id = opportunityId;
  else delete out.id;

  return {
    payload: out as unknown as GHLWebhookPayload,
    presence: {
      locationId: !!locationId,
      opportunityId: !!opportunityId,
      contactId: !!contactId,
      stageName: !!stageName,
      stageId: !!stageId,
    },
    receivedKeys,
  };
}
