#!/usr/bin/env bash
# test-ghl-webhook.sh
#
# Sends mock GHL webhook payloads to the local /api/ghl/webhooks endpoint.
# Covers all 5 cases in qa/ghl-webhook-test-cases.md.
#
# Usage:
#   ./scripts/test-ghl-webhook.sh
#
# Environment:
#   GHL_WEBHOOK_SECRET  — must match the value in .env.local for signature tests.
#                         If unset, TC-GHL-002 is skipped and the rest run without
#                         signing (dev mode bypass on the server side).
#   WEBHOOK_URL         — override base URL (default: http://localhost:3000)
#
# Example with secret:
#   GHL_WEBHOOK_SECRET=test-secret-dev ./scripts/test-ghl-webhook.sh

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────────

BASE_URL="${WEBHOOK_URL:-http://localhost:3000}"
ENDPOINT="$BASE_URL/api/ghl/webhooks"
SECRET="${GHL_WEBHOOK_SECRET:-}"

# ─── Colours ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ─── Helpers ──────────────────────────────────────────────────────────────────

# Compute HMAC-SHA256 of a payload string using GHL_WEBHOOK_SECRET.
# Returns empty string if SECRET is unset (signature omitted → dev bypass).
sign() {
  local payload="$1"
  if [[ -z "$SECRET" ]]; then
    echo ""
  else
    printf '%s' "$payload" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}'
  fi
}

# Send one webhook request and print a pass/fail summary.
# Args: test_id label payload [signature_override]
#   signature_override — if provided, use this instead of computing from payload.
#                        Pass "NONE" to omit the header entirely.
send() {
  local test_id="$1"
  local label="$2"
  local payload="$3"
  local sig_override="${4:-}"

  echo ""
  echo -e "${CYAN}${BOLD}▶ ${test_id}: ${label}${RESET}"

  # Determine signature header value
  local sig=""
  if [[ "$sig_override" == "NONE" ]]; then
    sig=""
  elif [[ -n "$sig_override" ]]; then
    sig="$sig_override"
  else
    sig="$(sign "$payload")"
  fi

  # Build curl args
  local curl_args=(-s -w "\n__HTTP_STATUS__%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$payload")

  if [[ -n "$sig" ]]; then
    curl_args+=(-H "x-ghl-signature: $sig")
  fi

  # Execute
  local raw_response
  raw_response=$(curl "${curl_args[@]}" "$ENDPOINT" 2>&1) || {
    echo -e "  ${RED}✗ curl failed — is the dev server running at $BASE_URL?${RESET}"
    FAILURES=$((FAILURES + 1))
    return
  }

  local http_code
  http_code=$(printf '%s' "$raw_response" | grep '__HTTP_STATUS__' | sed 's/__HTTP_STATUS__//')
  local body
  body=$(printf '%s' "$raw_response" | grep -v '__HTTP_STATUS__')

  echo -e "  ${DIM}Endpoint : $ENDPOINT${RESET}"
  if [[ -n "$sig" ]]; then
    echo -e "  ${DIM}Signature: ${sig:0:16}...${RESET}"
  else
    echo -e "  ${DIM}Signature: (none)${RESET}"
  fi
  echo -e "  Status   : ${BOLD}$http_code${RESET}"
  echo -e "  Body     : $body"

  # Evaluate
  local expected_code="$5"
  if [[ "$http_code" == "$expected_code" ]]; then
    echo -e "  ${GREEN}✓ PASS — got $http_code as expected${RESET}"
    PASSES=$((PASSES + 1))
  else
    echo -e "  ${RED}✗ FAIL — expected $expected_code, got $http_code${RESET}"
    FAILURES=$((FAILURES + 1))
  fi
}

# ─── Boot check ───────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}GHL Webhook Integration Tests${RESET}"
echo -e "${DIM}Endpoint : $ENDPOINT${RESET}"
if [[ -n "$SECRET" ]]; then
  echo -e "${DIM}Secret   : set (${#SECRET} chars)${RESET}"
else
  echo -e "${YELLOW}Secret   : not set — TC-GHL-002 will be skipped; others run unsigned (dev bypass)${RESET}"
fi
echo ""

# Check server is reachable
if ! curl -s --max-time 3 "$BASE_URL" > /dev/null 2>&1; then
  echo -e "${RED}Error: dev server not reachable at $BASE_URL${RESET}"
  echo "Start it with: npm run dev"
  exit 1
fi

PASSES=0
FAILURES=0

# ─── TC-GHL-001 — Valid payload ───────────────────────────────────────────────

TC001_PAYLOAD='{
  "type": "OpportunityStatusChange",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "id": "opp-test-tc001",
  "name": "Weekly Pool Service — Rodriguez",
  "monetaryValue": 125.00,
  "pipelineId": "pipe_k8Nm2PqRsT4v",
  "pipelineStageId": "stage_Xw3YzA1bCdEfGh",
  "pipelineStage": {
    "id": "stage_Xw3YzA1bCdEfGh",
    "name": "Scheduled"
  },
  "status": "open",
  "assignedTo": "ghl_user_Jk5LmNpQrStUvW",
  "contact": {
    "id": "ghl-cnt-rodriguez-001",
    "name": "Jane Rodriguez",
    "email": "jane@example.com",
    "phone": "+13105551234"
  },
  "notes": "Customer requested morning slot. Gate code on file.",
  "customFields": [
    { "id": "sT9UvWxYzAbCdEfG", "fieldValue": "2025-04-15" },
    { "id": "hI1JkLmNoPqRsTuV", "fieldValue": "08:00" },
    { "id": "wX3YzAbCdEfGhIjK", "fieldValue": "09:00" },
    { "id": "lM5NoPqRsTuVwXyZ", "fieldValue": "normal" }
  ],
  "dateAdded": "2024-03-15T08:00:00.000Z",
  "dateUpdated": "2026-05-05T14:30:00.000Z"
}'

send "TC-GHL-001" "Valid payload — work order created" \
  "$TC001_PAYLOAD" "" "200"

# ─── TC-GHL-002 — Invalid signature ──────────────────────────────────────────

echo ""
echo -e "${BOLD}── TC-GHL-002 ──${RESET}"

if [[ -z "$SECRET" ]]; then
  echo -e "${YELLOW}  SKIP — GHL_WEBHOOK_SECRET is not set.${RESET}"
  echo -e "${YELLOW}  Set it to test signature rejection: GHL_WEBHOOK_SECRET=test-secret-dev ./scripts/test-ghl-webhook.sh${RESET}"
else
  TC002_PAYLOAD='{
  "type": "OpportunityStatusChange",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "id": "opp-test-tc002",
  "pipelineStage": { "id": "stage_x", "name": "Scheduled" },
  "status": "open",
  "contact": { "id": "ghl-cnt-rodriguez-001" }
}'

  WRONG_SIG="0000000000000000000000000000000000000000000000000000000000000000"
  send "TC-GHL-002" "Invalid signature — expect 401" \
    "$TC002_PAYLOAD" "$WRONG_SIG" "401"
fi

# ─── TC-GHL-003 — Duplicate payload ──────────────────────────────────────────
# Re-uses TC001_PAYLOAD. Depends on TC-GHL-001 having run first in this session.

send "TC-GHL-003" "Duplicate payload — idempotent, no second work order" \
  "$TC001_PAYLOAD" "" "200"

# ─── TC-GHL-004 — Missing contact ID ─────────────────────────────────────────

TC004_PAYLOAD='{
  "type": "OpportunityStatusChange",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "id": "opp-test-tc004",
  "name": "Orphaned Opportunity — no contact",
  "pipelineStage": { "id": "stage_x", "name": "Scheduled" },
  "status": "open",
  "contact": {}
}'

send "TC-GHL-004" "Missing contact.id — skipped gracefully" \
  "$TC004_PAYLOAD" "" "200"

# ─── TC-GHL-005 — Unknown event type ─────────────────────────────────────────

TC005_PAYLOAD='{
  "type": "InvoiceSent",
  "locationId": "ve9EPM428h8vShlRW1KT",
  "id": "inv-test-tc005"
}'

send "TC-GHL-005" "Unknown event type — logged and discarded" \
  "$TC005_PAYLOAD" "" "200"

# ─── Results ──────────────────────────────────────────────────────────────────

echo ""
echo "────────────────────────────────────────"
TOTAL=$((PASSES + FAILURES))
if [[ $FAILURES -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All $TOTAL tests passed${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES / $TOTAL tests failed${RESET}"
fi
echo ""

# Exit non-zero if any test failed (useful in CI)
[[ $FAILURES -eq 0 ]]
