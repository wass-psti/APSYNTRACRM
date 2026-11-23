#!/bin/sh
set -eu
# CP-FT-UI-05: independent ephemeral database with NO network/host port.
# Will NOT connect to the developer's existing local stack or production.
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NAME="cp-ft-ui05-rls-$$"
cleanup(){
 docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM
docker run -d --rm --network none --name "$NAME" \
 -e POSTGRES_PASSWORD=disposable-only-not-reused \
 postgres:17-alpine >/dev/null
ready=0
i=0
while [ "$i" -lt 35 ]; do
 if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then ready=1;break;fi
 i=$((i+1))
 sleep 1
done
if [ "$ready" -ne 1 ];then echo "FAIL: isolated Postgres did not start";exit 1;fi

docker cp "$ROOT/sql/tests/cp-ft-ui05-prerequisites.sql" "$NAME:/tmp/prerequisites.sql"
docker cp "$ROOT/supabase/migrations/20260928034824_fueltrans_workspace_integration.sql" "$NAME:/tmp/fueltrans-migration.sql"
docker cp "$ROOT/supabase/migrations/20260928035728_fueltrans_membership_identity.sql" "$NAME:/tmp/fueltrans-identity.sql"
docker cp "$ROOT/supabase/migrations/20260928035850_fueltrans_notifications.sql" "$NAME:/tmp/fueltrans-notifications.sql"
docker cp "$ROOT/supabase/migrations/20260928040345_fueltrans_admin_state_and_hardening.sql" "$NAME:/tmp/fueltrans-hardening.sql"
docker cp "$ROOT/supabase/migrations/20260928041601_fueltrans_policy_hardening.sql" "$NAME:/tmp/fueltrans-policies.sql"
docker cp "$ROOT/supabase/migrations/20260929005600_fueltrans_workspace_contract_guard.sql" "$NAME:/tmp/fueltrans-contract-guard.sql"
docker cp "$ROOT/sql/tests/cp-ft-ui05-disposable-lifecycle.sql" "$NAME:/tmp/lifecycle.sql"

run(){
 docker exec "$NAME" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$1"
}
run /tmp/prerequisites.sql
run /tmp/fueltrans-migration.sql
run /tmp/fueltrans-identity.sql
run /tmp/fueltrans-notifications.sql
run /tmp/fueltrans-hardening.sql
run /tmp/fueltrans-policies.sql
run /tmp/fueltrans-contract-guard.sql
run /tmp/lifecycle.sql
echo "PASS CP-FT-UI-05: original FuelTrans RLS migration and host guard, two real PostgreSQL identities, persisted lifecycle/readback, denial, CAS, and revocation"
echo "Container teardown: automatic (network isolated; no host ports)"
