#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NAME="cp-fm1-core03-disposable-$$"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
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

psql_in -q < sql/tests/cp-fm1-core-02-disposable-setup.sql
psql_in -q < sql/tests/cp-fm1-core-03-disposable-setup.sql
psql_in -q < supabase/migrations/20261116055815_cp_fm1_core_02_server_incident_sla.sql
psql_in -q < supabase/migrations/20261116082518_cp_fm1_core_03_operational_workflows.sql
psql_in < sql/tests/cp-fm1-core-02-runtime.sql
psql_in < sql/tests/cp-fm1-core-03-runtime.sql

echo "CP-FM1-CORE-03 disposable PostgreSQL acceptance passed."
