#!/usr/bin/env bash
set -euo pipefail

OUTPUT_PATH="${1:-}"
if [[ -z "${OUTPUT_PATH}" ]]; then
  echo "Usage: $0 <output.dump>"
  exit 1
fi

if [[ -f ".env.local" ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.local | xargs)
elif [[ -f ".env" ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env | xargs)
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set."
  exit 1
fi

mkdir -p "$(dirname "${OUTPUT_PATH}")"
pg_dump --format=custom --no-owner --no-privileges --file "${OUTPUT_PATH}" "${DATABASE_URL}"
echo "Backup created at ${OUTPUT_PATH}"
