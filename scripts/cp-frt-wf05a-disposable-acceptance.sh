#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NAME="cp-frt-wf05a-disposable-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=disposable postgres:17 >/dev/null
ready=false
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "Disposable PostgreSQL did not become ready." >&2
  exit 1
fi

psql_in() {
  docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

psql_in -q < sql/tests/cp-frt-wf05a-disposable-setup.sql
psql_in -q < supabase/migrations/20261116101100_frt_wf05a_activity_comments_archive.sql
psql_in < sql/tests/cp-frt-wf05a-operations-disposable.sql

echo "CP-FRT-WF-05A disposable PostgreSQL acceptance passed."
