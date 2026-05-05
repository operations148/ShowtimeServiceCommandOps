// GHL (GoHighLevel) webhook payload types.
// Shapes are derived from the GHL API v2 webhook documentation and confirmed
// against the integration-blueprint mapping files.
//
// Key asymmetry: contact events use customField [{id, value}] (singular, "value")
//                opportunity events use customFields [{id, fieldValue}] (plural, "fieldValue")

// ─── Shared sub-types ────────────────────────────────────────────────────────

/** Custom field entry on contact webhook payloads. */
export interface GHLContactCustomField {
  id: string;
  value: string;
}

/** Custom field entry on opportunity webhook payloads. */
export interface GHLOpportunityCustomField {
  id: string;
  fieldValue: string;
}

export interface GHLPipelineStage {
  id: string;
  name: string;
}

export interface GHLContactRef {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface GHLAppointmentInfo {
  id: string;
  calendarId?: string;
  title?: string;
  notes?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  address?: string;
  assignedUserId?: string;
}

// ─── Contact event payloads ───────────────────────────────────────────────────

interface GHLContactEventBase {
  locationId: string;
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  companyName?: string;
  website?: string;
  source?: string;
  dnd?: boolean;
  tags?: string[];
  /** Array of custom field values; key is "value" (not "fieldValue"). */
  customField?: GHLContactCustomField[];
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GHLContactCreatePayload extends GHLContactEventBase {
  type: "ContactCreate";
}

export interface GHLContactUpdatePayload extends GHLContactEventBase {
  type: "ContactUpdate";
}

export interface GHLContactDeletePayload {
  type: "ContactDelete";
  locationId: string;
  id: string;
}

export interface GHLContactTagAppliedPayload {
  type: "ContactTagApplied";
  locationId: string;
  id: string;
  tags?: string[];
}

// ─── Opportunity event payloads ───────────────────────────────────────────────

interface GHLOpportunityEventBase {
  locationId: string;
  id: string;
  name?: string;
  monetaryValue?: number;
  pipelineId?: string;
  pipelineStageId?: string;
  pipelineStage?: GHLPipelineStage;
  /** Top-level GHL status: open | won | lost | abandoned.
   *  Must be combined with pipelineStage.name for accurate ServiceOps mapping. */
  status?: "open" | "won" | "lost" | "abandoned";
  assignedTo?: string;
  contact?: GHLContactRef;
  source?: string;
  notes?: string;
  /** Array of custom field values; key is "fieldValue" (not "value"). */
  customFields?: GHLOpportunityCustomField[];
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GHLOpportunityCreatePayload extends GHLOpportunityEventBase {
  type: "OpportunityCreate";
}

export interface GHLOpportunityStatusChangePayload extends GHLOpportunityEventBase {
  type: "OpportunityStatusChange";
}

export interface GHLOpportunityStageUpdatePayload extends GHLOpportunityEventBase {
  type: "OpportunityStageUpdate";
}

export interface GHLOpportunityAssignedToUpdatePayload extends GHLOpportunityEventBase {
  type: "OpportunityAssignedToUpdate";
}

export interface GHLOpportunityMonetaryValueUpdatePayload extends GHLOpportunityEventBase {
  type: "OpportunityMonetaryValueUpdate";
}

export interface GHLOpportunityDeletePayload {
  type: "OpportunityDelete";
  locationId: string;
  id: string;
}

// ─── Appointment event payloads ───────────────────────────────────────────────

export interface GHLAppointmentBookedPayload {
  type: "AppointmentBooked";
  locationId: string;
  appointmentInfo?: GHLAppointmentInfo;
  contact?: GHLContactRef;
}

// ─── Discriminated union ──────────────────────────────────────────────────────

export type GHLWebhookPayload =
  | GHLContactCreatePayload
  | GHLContactUpdatePayload
  | GHLContactDeletePayload
  | GHLContactTagAppliedPayload
  | GHLOpportunityCreatePayload
  | GHLOpportunityStatusChangePayload
  | GHLOpportunityStageUpdatePayload
  | GHLOpportunityAssignedToUpdatePayload
  | GHLOpportunityMonetaryValueUpdatePayload
  | GHLOpportunityDeletePayload
  | GHLAppointmentBookedPayload;

/** All valid event type strings. Derive from the union to stay in sync. */
export type GHLWebhookEventType = GHLWebhookPayload["type"];
