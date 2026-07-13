#!/bin/bash
# Fails if any already-committed migration file has been modified in this
# branch's diff against its base -- migrations must be additive-only (see
# CLAUDE.md, .claude/rules/documentation-rules.md, and the Phase 1 spec's
# "add additive Supabase migrations, do not rewrite applied migrations").
#
# Usage: scripts/check-migrations.sh [base-ref]
# Defaults to comparing against origin/master.

set -euo pipefail

BASE_REF="${1:-origin/master}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "Base ref '$BASE_REF' not found locally -- skipping migration-modification check."
  echo "(This is expected in a shallow CI checkout without the base branch fetched; the"
  echo " workflow fetches it explicitly before calling this script.)"
  exit 0
fi

MODIFIED=$(git diff --name-status "$BASE_REF"...HEAD -- supabase/migrations/ | awk '$1 == "M" { print $2 }')

if [ -n "$MODIFIED" ]; then
  echo "ERROR: the following already-applied migration file(s) were modified:"
  echo "$MODIFIED"
  echo
  echo "Migrations must be additive-only. Create a new migration file instead of"
  echo "editing one that may already be applied to a live database."
  exit 1
fi

echo "Migration check passed -- no existing migration files were modified."
