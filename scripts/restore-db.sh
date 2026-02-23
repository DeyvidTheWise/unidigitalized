#!/usr/bin/env bash
set -euo pipefail

DUMP_PATH="${1:-}"
TARGET_URL="${2:-${DATABASE_URL:-}}"

if [[ -z "${DUMP_PATH}" ]]; then
  echo "Usage: $0 <input.dump> [target_database_url]"
  exit 1
fi

if [[ ! -f "${DUMP_PATH}" ]]; then
  echo "Dump file not found: ${DUMP_PATH}"
  exit 1
fi

if [[ -f ".env.local" ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.local | xargs)
elif [[ -f ".env" ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env | xargs)
fi

if [[ -z "${TARGET_URL}" ]]; then
  echo "Target database URL is not set."
  exit 1
fi

pg_restore --clean --if-exists --no-owner --no-privileges --dbname "${TARGET_URL}" "${DUMP_PATH}"
echo "Restore completed from ${DUMP_PATH}"
