#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
name="cp-crm-conn03a-disposable-$PPID"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run --rm -d --network none --name "$name" -e POSTGRES_PASSWORD=disposable-only postgres:17 >/dev/null
for i in {1..40}; do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null 2>&1; then break; fi
  sleep 0.25
done
docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null
docker exec -i "$name" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres   < scripts/cp-crm-conn03a-disposable-fixture.sql
docker exec -i "$name" psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres   < supabase/migrations/20261119024533_cp_crm_conn03a_native_board_membership_provision.sql
docker exec -i "$name" psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres   < scripts/cp-crm-conn03a-disposable-assert.sql
