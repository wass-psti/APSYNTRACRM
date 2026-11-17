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
 if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then ready=true;break;fi
 sleep 1
done
if [[ "$ready" != true ]];then echo "Disposable PostgreSQL did not become ready." >&2;exit 1;fi
psql_in(){ docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
psql_in -q < sql/tests/cp-frt-wf05a-disposable-setup.sql
psql_in -q < supabase/migrations/20261116104500_frt_wf05a_archive_recovery.sql
psql_in -q < supabase/migrations/20261116172414_frt_restricted_voucher_projection.sql
psql_in -q < supabase/migrations/20261117010000_frt_wf05b_monthly_voucher_and_duplicate_guard.sql
psql_in -q < supabase/migrations/20261117031500_frt_company_profile_metadata.sql
psql_in -q < supabase/migrations/20261117034526_frt_flow03c_request_accounting_lines.sql
psql_in < sql/tests/cp-frt-wf05a-archive-disposable.sql
psql_in < sql/tests/cp-frt-wf05b-voucher-disposable.sql
psql_in < sql/tests/cp-frt-flow03c-disposable.sql

# Prepare one disposable request, then race two saves against the same revision.
psql_in -q -c "INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status,display_name) VALUES('$WORKSPACE','$ACTOR','REQUESTOR',true,'active','Disposable Concurrent Requestor') ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='REQUESTOR',enabled=true,status='active';"
docker exec -i "$NAME" psql -X -q -U postgres -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
SET request.jwt.claim.sub = '$ACTOR';
SELECT public.frt_create_request('$WORKSPACE',jsonb_build_object(
 'company','WASS','title','CP-FRT-FLOW-03C concurrent accounting acceptance',
 'department','Operations','fundSource','WASS Operating Account',
 'requestDate','2026-11-17','dateNeeded','2026-11-20',
 'description','Disposable concurrent accounting test',
 'recipientName','Concurrent Accounting Supplier','recipientBank','BPI',
 'recipientAccount','9876543210','items',jsonb_build_array(
  jsonb_build_object('category','Operations','amount','100.00','notes','Concurrency fixture')
 )));
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
