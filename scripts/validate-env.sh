#!/bin/bash
# Validate required environment variables.
#
# security-audit M16: this script previously existed but was never invoked by
# any npm script/CI step, and its variable list was stale (checked unused
# NEXT_PUBLIC_APP_NAME/DATABASE_URL, omitted load-bearing vars like
# SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET). Now wired into `npm run build`
# via the `prebuild` script in package.json.
#
# Next.js loads .env.local into its own process automatically; a separate
# shell script does not get those values for free. `source`-ing the file
# directly is unsafe here because several values (e.g. GHL_JOB_READY_STAGES)
# are unquoted and contain spaces/commas, which bash would try to parse as
# a separate command rather than part of the assignment -- and using `read`
# with a custom IFS='=' silently drops a trailing `=` (common in base64
# secrets like NEXTAUTH_SECRET), since a trailing delimiter with nothing
# after it doesn't produce a phantom empty field. `cut -d= -f2-` has neither
# problem: it never evaluates the value as shell code and always keeps
# everything after the first `=` verbatim.
# (Locally only -- on Vercel/CI no .env.local file exists and the vars are
# already real env vars, so this function's file branch is a no-op there.)
env_value() {
  local key="$1"
  if [ -n "${!key}" ]; then
    printf '%s' "${!key}"
    return
  fi
  if [ -f .env.local ]; then
    grep -E "^${key}=" .env.local | tail -1 | cut -d= -f2-
  fi
}

echo "Checking environment variables..."

REQUIRED_VARS=(
  "NEXTAUTH_SECRET"
  "NEXTAUTH_URL"
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "GHL_WEBHOOK_SECRET"
  "GHL_PRIVATE_INTEGRATION_TOKEN"
  "GHL_LOCATION_ID"
  # Inbound GHL webhooks resolve tenant SOLELY from this map
  # (src/lib/ghl/tenant-config.ts). If it is missing or malformed,
  # resolveTenantId() returns undefined and EVERY inbound delivery is
  # discarded as unknown_tenant -- with no work order created. It was
  # load-bearing but unvalidated until this check was added.
  "GHL_LOCATION_TO_TENANT"
  "CRON_SECRET"
)

# Vars that are needed for specific features but shouldn't hard-fail a build
# that doesn't use them yet (Stripe is not wired to any live traffic path --
# see docs/audits/markate-gap-analysis.md).
RECOMMENDED_VARS=(
  "RESEND_API_KEY"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "$(env_value "$var")" ]; then
    MISSING+=("$var")
  fi
done

MISSING_RECOMMENDED=()
for var in "${RECOMMENDED_VARS[@]}"; do
  if [ -z "$(env_value "$var")" ]; then
    MISSING_RECOMMENDED+=("$var")
  fi
done

if [ ${#MISSING_RECOMMENDED[@]} -gt 0 ]; then
  echo "WARNING: Missing recommended environment variables (feature-specific, not build-blocking):"
  for var in "${MISSING_RECOMMENDED[@]}"; do
    echo "  - $var"
  done
fi

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ERROR: Missing required environment variables:"
  for var in "${MISSING[@]}"; do
    echo "  - $var"
  done
  exit 1
else
  echo "All required environment variables are set."
fi

# ---------------------------------------------------------------------------
# Structural validation of GHL_LOCATION_TO_TENANT
#
# Presence alone is not enough: a syntactically broken or semantically empty
# map fails the SAME way a missing one does -- resolveTenantId() returns
# undefined and every inbound GHL webhook is silently discarded. These checks
# catch that at build time instead of at 2am in production.
#
# The value is passed through the environment (never argv) and the validator
# prints only counts and boolean outcomes -- never keys, never tenant IDs.
# ---------------------------------------------------------------------------
GHL_MAP_VALUE="$(env_value GHL_LOCATION_TO_TENANT)"
GHL_LOCATION_ID_VALUE="$(env_value GHL_LOCATION_ID)"

if [ -n "$GHL_MAP_VALUE" ]; then
  if ! GHL_MAP_VALUE="$GHL_MAP_VALUE" GHL_LOCATION_ID_VALUE="$GHL_LOCATION_ID_VALUE" node -e '
    const raw = process.env.GHL_MAP_VALUE ?? "";
    const locationId = (process.env.GHL_LOCATION_ID_VALUE ?? "").trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("ERROR: GHL_LOCATION_TO_TENANT is not valid JSON.");
      console.error("       Expected: {\"<ghlLocationId>\":\"<tenantUuid>\"}");
      process.exit(1);
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.error("ERROR: GHL_LOCATION_TO_TENANT must be a JSON object, not an array or scalar.");
      process.exit(1);
    }

    const keys = Object.keys(parsed);
    if (keys.length === 0) {
      console.error("ERROR: GHL_LOCATION_TO_TENANT is an empty object -- no location maps to a tenant,");
      console.error("       so every inbound GHL webhook would be discarded as unknown_tenant.");
      process.exit(1);
    }

    // No blank tenant values: "" is falsy downstream and behaves as unmapped.
    const blank = keys.filter((k) => {
      const v = parsed[k];
      return typeof v !== "string" || v.trim() === "";
    });
    if (blank.length > 0) {
      console.error(`ERROR: GHL_LOCATION_TO_TENANT has ${blank.length} location key(s) with an empty or non-string tenant value.`);
      process.exit(1);
    }

    // The configured inbound location must actually be mapped, otherwise
    // webhooks for that location resolve to no tenant.
    // (No apostrophes in this block: it lives inside a single-quoted bash
    // string, so one would terminate it and break the script.)
    if (locationId && !Object.prototype.hasOwnProperty.call(parsed, locationId)) {
      console.error("ERROR: GHL_LOCATION_TO_TENANT does not contain the configured GHL_LOCATION_ID.");
      console.error("       Inbound webhooks for that location would resolve to no tenant.");
      process.exit(1);
    }

    console.log(`GHL_LOCATION_TO_TENANT is valid (${keys.length} location mapping(s)` +
      (locationId ? ", configured GHL_LOCATION_ID is mapped)." : ")."));
  '; then
    exit 1
  fi
fi
