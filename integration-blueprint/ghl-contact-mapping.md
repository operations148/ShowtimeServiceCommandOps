# GHL Contact → ServiceOps Property Mapping

## Source-of-Truth Rules (from ghl-source-of-truth-rules.md)

- GHL **owns** the contact record. ServiceOps never duplicates or overwrites contact identity data.
- ServiceOps stores only `ghl_contact_id` as the foreign key — not name, email, or phone.
- Customer name and address are mirrored from GHL into ServiceOps at creation time and re-synced on `ContactUpdate` webhooks.
- Pool-specific fields (`gate_code`, `access_notes`, `service_notes`, `pool_equipment`) live **only in ServiceOps**. GHL never receives them back.

---

## Triggering Webhook Events

| GHL Event Type     | ServiceOps Action                                                      |
|--------------------|------------------------------------------------------------------------|
| `ContactCreate`    | Create a new `Property` record if no existing record has this `ghl_contact_id` |
| `ContactUpdate`    | Upsert `Property` — update name and address if record exists; create if not |
| `ContactDelete`    | Soft-delete: set `Property.is_active = false`                         |
| `ContactTagApplied`| TBD — reserved for future automation rules (e.g., tag "vip" → set priority) |

> **Note**: `ContactTagApplied` is not mapped in Phase 1. Log it and discard.

---

## GHL Webhook Payload — `ContactCreate` / `ContactUpdate`

This is the exact JSON shape GHL sends for contact events (GHL API v2):

```json
{
  "type": "ContactCreate",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "id": "ocQHyuzHvysMo5N5VsXc",
  "firstName": "Jane",
  "lastName": "Rodriguez",
  "name": "Jane Rodriguez",
  "email": "jane@example.com",
  "phone": "+13105551234",
  "address1": "1234 Sunset Blvd",
  "city": "Los Angeles",
  "state": "CA",
  "postalCode": "90028",
  "country": "US",
  "companyName": "",
  "website": "",
  "source": "manual",
  "dnd": false,
  "tags": ["pool-customer", "active"],
  "customField": [
    { "id": "DRyEuEfNGZxnA0B9WXZY", "value": "2847" },
    { "id": "K9mPqRsT4vXwYzA1bCdE", "value": "Side gate on left. Small dog (harmless). Park on street." },
    { "id": "F3hJkLmN6pQrSuVwXyZ2", "value": "Prefers service before 10am. Check salt cell after each visit." }
  ],
  "dateAdded": "2024-03-15T08:00:00.000Z",
  "dateUpdated": "2024-03-15T08:00:00.000Z"
}
```

**Key payload notes:**
- `id` — GHL's internal contact UUID. This is the permanent foreign key for ServiceOps.
- `locationId` — GHL's sub-account ID. Maps to `tenant_id` via a lookup table (see Tenant Routing below).
- `customField` — array of `{id, value}` objects. Field IDs are **account-specific** and must be configured per environment (see Custom Field Configuration below).
- `companyName` — use as `customer_name` if `name` is absent or empty.
- `postalCode` — GHL uses `postalCode`, not `zip`.
- `country` — ignore; ServiceOps is US-only in Phase 1.
- `dnd` — do-not-disturb flag; not mapped, not stored.

---

## Field Mapping: GHL Contact → ServiceOps `Property`

| GHL Payload Field                  | ServiceOps `Property` Field | Transform / Notes                                                   |
|------------------------------------|-----------------------------|---------------------------------------------------------------------|
| `id`                               | `ghl_contact_id`            | Store verbatim. This is the permanent link.                         |
| `locationId`                       | `tenant_id`                 | Look up in `GHL_LOCATION_TO_TENANT` env map (see Tenant Routing)   |
| `name`                             | `customer_name`             | Trim whitespace. Fall back to `companyName` if `name` is empty.     |
| `firstName` + `lastName`          | *(not stored separately)*   | `name` field is the canonical full name in GHL; use that.           |
| `address1`                         | `address_line1`             | Trim whitespace. Required — skip record if absent.                  |
| *(no address_line2 in GHL)*       | `address_line2`             | Leave `undefined`. GHL has no line 2 for contacts.                  |
| `city`                             | `city`                      | Trim whitespace. Required — skip record if absent.                  |
| `state`                            | `state`                     | Uppercase 2-letter abbreviation. GHL may send full name — convert.  |
| `postalCode`                       | `zip`                       | Accept 5-digit or ZIP+4. Validate format before saving.             |
| `customField[GHL_CF_GATE_CODE]`    | `gate_code`                 | Look up by env-configured field ID. Max 20 chars.                   |
| `customField[GHL_CF_ACCESS_NOTES]` | `access_notes`              | Look up by env-configured field ID. Max 1000 chars — truncate.      |
| `customField[GHL_CF_SERVICE_NOTES]`| `service_notes`             | Look up by env-configured field ID. Max 2000 chars — truncate.      |
| *(not in GHL)*                     | `pool_equipment`            | Never populated from GHL. Entered manually in ServiceOps.           |
| *(not in GHL)*                     | `is_active`                 | Default `true` on create. Set `false` on `ContactDelete` event.     |
| `dateAdded`                        | `created_at`                | ISO 8601 → store as-is for reference only; ServiceOps sets its own. |

**Fields deliberately NOT mapped:**
- `email` — GHL owns this. Not stored in ServiceOps.
- `phone` — GHL owns this. Not stored in ServiceOps.
- `tags` — Not stored in Phase 1. Reserved for future automation.
- `website`, `companyName`, `source`, `dnd`, `country` — Not relevant to ServiceOps.

---

## Custom Field Configuration

GHL custom field IDs are unique per location (sub-account). They must be configured as environment variables. The implementation reads these at runtime to extract values from the `customField` array.

```
# .env — GHL custom field IDs for Showtime Pools
GHL_CF_GATE_CODE=DRyEuEfNGZxnA0B9WXZY
GHL_CF_ACCESS_NOTES=K9mPqRsT4vXwYzA1bCdE
GHL_CF_SERVICE_NOTES=F3hJkLmN6pQrSuVwXyZ2
```

**How to find GHL custom field IDs:**
1. GHL Dashboard → Settings → Custom Fields
2. Each field shows its ID on the edit screen, or retrieve via `GET /v1/custom-fields/` API
3. Confirm field IDs with the client before going live

**Extraction logic (pseudocode):**
```ts
function extractCustomField(
  fields: { id: string; value: string }[],
  envKey: string
): string | undefined {
  const fieldId = process.env[envKey];
  if (!fieldId) return undefined;
  return fields.find((f) => f.id === fieldId)?.value ?? undefined;
}
```

---

## Tenant Routing

`locationId` from GHL must be mapped to a ServiceOps `tenant_id`. Configure this as a JSON env variable:

```
GHL_LOCATION_TO_TENANT={"ve9EPM428h8vShlRW1KT":"tenant-showtime"}
```

If `locationId` is not found in the map, **reject the webhook** with a 400 response and log the unknown location ID. Do not create records for unknown tenants.

---

## Upsert Logic (ContactCreate / ContactUpdate)

```
1. Resolve tenant_id from locationId → reject if unknown
2. Look up Property by ghl_contact_id AND tenant_id
3. If NOT found → create new Property with mapped fields
4. If found → update only: customer_name, address_line1, city, state, zip,
              gate_code, access_notes, service_notes
   Do NOT overwrite: pool_equipment, is_active (unless ContactDelete event)
5. Set updated_at = now()
```

**On duplicate address conflict**: If a different Property already exists at the same address (different `ghl_contact_id`), create the new record anyway. Address uniqueness is not enforced — two contacts may share a property (e.g., landlord + tenant).

---

## Error Handling

| Condition                              | Action                                                             |
|----------------------------------------|--------------------------------------------------------------------|
| Missing required field (`address1`, `city`, `state`, `postalCode`) | Log warning, skip create, return 200 to GHL (do not retry) |
| Unknown `locationId`                  | Log error, return 200                                             |
| `name` and `companyName` both empty   | Use `"Unknown Customer"` as placeholder — flag for review         |
| `state` is full name (e.g. "California") | Convert to 2-letter abbreviation via lookup table              |
| Custom field ID not configured in env | Skip that field silently — do not fail the record                 |
| Database write fails                  | Log error with full payload, return 200 to GHL, queue for retry   |

---

## Phase 1 Limitations

- Pool equipment (`pool_equipment`) is never populated from GHL. Technicians or admins add it manually in ServiceOps.
- No address deduplication — two contacts at the same address create two Property records.
- `tags` from GHL are not acted on. All tag-based automation is Phase 2+.
- State name → abbreviation conversion is a best-effort lookup. Flag ambiguous values for manual review.
