#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NAME="cp-frt-flow03c-$$"
WORKSPACE="00000000-0000-4000-8000-000000000001"
ACTOR="00000000-0000-4000-8000-000000000002"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=disposable postgres:17 >/dev/null
ready=false
for _ in $(seq 1 60); do
 # The Docker entrypoint starts a temporary socket-only server during initdb.
 # Require a successful SQL query over TCP against the final server.
 if docker exec -e PGPASSWORD=disposable "$NAME" psql -X -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt -c "SELECT 1" >/dev/null 2>&1; then ready=true;break;fi
 sleep 1
done
if [[ "$ready" != true ]];then echo "Disposable PostgreSQL did not become ready." >&2;exit 1;fi
psql_in(){ docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
psql_in -q < sql/tests/cp-frt-flow03c-disposable-setup.sql
psql_in -q < supabase/migrations/20261116172414_frt_restricted_voucher_projection.sql
psql_in -q < supabase/migrations/20261117051021_frt_company_profile_metadata.sql
psql_in -q < supabase/migrations/20261117051040_frt_flow03c_request_accounting_lines.sql
psql_in -q < supabase/migrations/20261117060000_frt_company_profile_tax_id.sql
psql_in < sql/tests/cp-frt-flow03c-disposable.sql

# Prepare one disposable request, then race two saves against the same revision.
psql_in -q -c "INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status,display_name) VALUES('$WORKSPACE','$ACTOR','REQUESTOR',true,'active','Disposable Concurrent Requestor') ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='REQUESTOR',enabled=true,status='active';"
psql_in -q <<SQL
INSERT INTO public.frt_requests(
 id,workspace_id,company_id,requestor_id,voucher_no,title,department,fund_source,
 recipient_name,recipient_bank,recipient_account,date_needed,description,total_amount
)
SELECT gen_random_uuid(),'$WORKSPACE',fc.id,'$ACTOR','DV-WASS-202611-TEST-001',
 'CP-FRT-FLOW-03C concurrent accounting acceptance','Operations','WASS Operating Account',
 'Concurrent Accounting Supplier','BPI','9876543210','2026-11-20',
 'Disposable concurrent accounting test',100.00
FROM public.frt_companies fc
WHERE fc.workspace_id='$WORKSPACE' AND fc.code='WASS';
SQL
REQUEST_ID="$(docker exec "$NAME" psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT id FROM public.frt_requests WHERE title='CP-FRT-FLOW-03C concurrent accounting acceptance' ORDER BY created_at DESC LIMIT 1;")"
if [[ ! "$REQUEST_ID" =~ ^[0-9a-f-]{36}$ ]];then echo "Could not create disposable concurrency request: $REQUEST_ID" >&2;exit 1;fi

concurrent_save(){
 docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SET request.jwt.claim.sub = '$ACTOR';
SELECT pg_sleep(0.3);
SELECT public.frt_save_request_accounting_lines('$WORKSPACE','$REQUEST_ID',0,
 '[{"accountCode":"1010","accountName":"Cash","description":"Concurrent debit","debitCents":10000,"creditCents":0},{"accountCode":"2010","accountName":"Payable","description":"Concurrent credit","debitCents":0,"creditCents":10000}]'::jsonb);
COMMIT;
SQL
}
set +e
concurrent_save > /tmp/cp-frt-flow03c-concurrent-a.log 2>&1 &
P1=$!
concurrent_save > /tmp/cp-frt-flow03c-concurrent-b.log 2>&1 &
P2=$!
wait "$P1"; S1=$?
wait "$P2"; S2=$?
set -e
if ! { [[ "$S1" -eq 0 && "$S2" -ne 0 ]] || [[ "$S2" -eq 0 && "$S1" -ne 0 ]]; };then
 cat /tmp/cp-frt-flow03c-concurrent-a.log /tmp/cp-frt-flow03c-concurrent-b.log
 echo "Concurrent accounting acceptance expected exactly one successful save and one stale-revision conflict." >&2
 exit 1
fi
FINAL="$(docker exec "$NAME" psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT coalesce(max(revision),0)||'|'||count(*)||'|'||(coalesce(sum(debit_amount),0)=coalesce(sum(credit_amount),0) AND coalesce(sum(debit_amount),0)=100.00) FROM public.frt_request_accounting_lines WHERE workspace_id='$WORKSPACE' AND fund_request_id='$REQUEST_ID';")"
if [[ "$FINAL" != "1|2|true" ]];then echo "Concurrent accounting readback was inconsistent: $FINAL" >&2;exit 1;fi
echo "CP-FRT-FLOW-03C disposable PostgreSQL 17 acceptance passed, including concurrent revision serialization."
