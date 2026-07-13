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
