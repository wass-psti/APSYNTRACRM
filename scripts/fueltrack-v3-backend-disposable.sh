#!/usr/bin/env bash
# Disposable PostgreSQL 16 acceptance. No production host, credentials or records.
set -euo pipefail
cd "$(dirname "$0")/.."
image="postgres:16-alpine"
primary="ft3-core-$$"
legacy="ft3-legacy-$$"
cleanup(){ docker rm -f "$primary" "$legacy" >/dev/null 2>&1 || true; }
trap cleanup EXIT
start() {
 local container="$1"
 docker run --rm -d --name "$container" -e POSTGRES_PASSWORD=isolated -e POSTGRES_DB=ft3check "$image" >/dev/null
 local i
 for i in {1..40}; do
  if docker exec "$container" psql -X -U postgres -d ft3check -Atc 'select 1' 2>/dev/null | grep -qx '1';then return 0;fi
  sleep 1
 done
 echo "BLOCKED: disposable PostgreSQL failed to start" >&2
 return 1
}
apply() {
 docker exec -i "$1" psql -X -v ON_ERROR_STOP=1 -U postgres -d ft3check < "$2" >/dev/null
}
echo '== FUELTRACK: disposable signed and Board/Storage acceptance =='
start "$primary"
apply "$primary" sql/tests/fueltrack-v3-backend-core-fixture.sql
apply "$primary" supabase/migrations/20261110021141_fueltrack_v3_backend_core.sql
apply "$primary" supabase/migrations/20261110021200_fueltrack_v3_board_receipts.sql
apply "$primary" sql/tests/fueltrack-v3-backend-core-acceptance.sql
apply "$primary" sql/tests/fueltrack-v3-board-receipt-acceptance.sql
# Reapply after records exist; all links are nonnull and migrations are repeat-safe.
apply "$primary" supabase/migrations/20261110021200_fueltrack_v3_board_receipts.sql
echo 'PASS: core contracts, Board links, receipt registration, security denials, and reapplication'
echo '== FUELTRACK: legacy unlinked-row preflight must fail before schema write =='
start "$legacy"
apply "$legacy" sql/tests/fueltrack-v3-backend-core-fixture.sql
apply "$legacy" supabase/migrations/20261110021141_fueltrack_v3_backend_core.sql
docker exec -i "$legacy" psql -X -v ON_ERROR_STOP=1 -U postgres -d ft3check >/dev/null <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
select public.fueltrack_v3_submit(
 '7af78b3f-67bf-4600-9aa1-9006d19d486e',
 '88888888-8888-4888-8888-888888888888','vehicle',
 '{"plate":"GAN 8289","owner":"Person B","origin":"Office","destination":"Depot","purpose":"Legacy request for preflight"}'::jsonb);
SQL
if docker exec -i "$legacy" psql -X -v ON_ERROR_STOP=1 -U postgres -d ft3check  < supabase/migrations/20261110021200_fueltrack_v3_board_receipts.sql  > /tmp/ft3-legacy-preflight-$$.log 2>&1; then
 echo 'FAILED: unlinked requests unexpectedly passed migration preflight' >&2
 exit 1
fi
if ! grep -q 'Legacy FuelTrack requests require an audited Board-link reconciliation'  /tmp/ft3-legacy-preflight-$$.log; then
 cat /tmp/ft3-legacy-preflight-$$.log >&2
 exit 1
fi
column="$(docker exec "$legacy" psql -X -At -U postgres -d ft3check -c  "select count(*) from information_schema.columns where table_schema='public' and table_name='fueltrack_v3_requests' and column_name='board_item_id'")"
if [[ "$column" != '0' ]];then
 echo 'FAILED: unsafe partial column was created on preflight denial' >&2
 exit 1
fi
rm -f /tmp/ft3-legacy-preflight-$$.log
echo 'PASS: legacy unlinked data blocks schema changes without partial writes'
echo 'FT3_DISPOSABLE_ACCEPTANCE_PASS'
