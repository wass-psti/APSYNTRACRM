#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NAME="cp-fm1-core04-disposable-$$"
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
psql_in -q < supabase/migrations/20261116092055_cp_fm1_core_04_operational_ui_reporting_warnings.sql
psql_in < sql/tests/cp-fm1-core-02-runtime.sql
psql_in < sql/tests/cp-fm1-core-03-runtime.sql
psql_in < sql/tests/cp-fm1-core-04-runtime.sql

CONCURRENCY_A="/tmp/cp-fm1-core-04-concurrency-a-$$.log"
CONCURRENCY_B="/tmp/cp-fm1-core-04-concurrency-b-$$.log"
psql_in < sql/tests/cp-fm1-core-04-concurrent-a.sql > "$CONCURRENCY_A" 2>&1 &
CONCURRENCY_A_PID=$!
sleep 0.25
set +e
psql_in < sql/tests/cp-fm1-core-04-concurrent-b.sql > "$CONCURRENCY_B" 2>&1
CONCURRENCY_B_EXIT=$?
set -e
wait "$CONCURRENCY_A_PID"
if [[ "$CONCURRENCY_B_EXIT" -eq 0 ]] || ! grep -q "40001" "$CONCURRENCY_B"; then
  cat "$CONCURRENCY_A" "$CONCURRENCY_B" >&2
  echo "Concurrent FM1 edit did not reject the stale competing revision." >&2
  exit 1
fi
CONCURRENCY_STATE="$(psql_in -Atc "SELECT revision::text||':'||requester_name FROM private.fm1_tickets WHERE idempotency_key='20000000-0000-4000-8000-000000000010'")"
if [[ "$CONCURRENCY_STATE" != "3:Concurrency Winner" ]]; then
  echo "Unexpected final concurrent edit state: $CONCURRENCY_STATE" >&2
  exit 1
fi
echo "CP-FM1-CORE-04 concurrent edit acceptance passed (winner committed, stale competing revision rejected)."
rm -f "$CONCURRENCY_A" "$CONCURRENCY_B"

echo "CP-FM1-CORE-04 disposable PostgreSQL acceptance passed."
