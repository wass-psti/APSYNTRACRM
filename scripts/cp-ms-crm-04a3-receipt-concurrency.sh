#!/usr/bin/env bash
set -euo pipefail
NAME="$1"
run_sql(){ docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cat >"$tmp/first.sql" <<'SQL'
set role authenticated;
select set_config('test.actor','11111111-1111-4111-8111-111111111111',false);
select set_config('test.workspace','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.domain_role','ADMIN',false);
begin;
select public.mrh_create_material_atomic('ffffffff-ffff-4fff-8fff-ffffffffffff','Recovery race','[]','{}');
\echo RECEIPT_LOCKED
select pg_sleep(2);
commit;
SQL
run_sql <"$tmp/first.sql" >"$tmp/first.log" 2>&1 &
PID=$!
for i in $(seq 1 80); do
 if grep -q RECEIPT_LOCKED "$tmp/first.log"; then break; fi
 if ! kill -0 "$PID" 2>/dev/null; then cat "$tmp/first.log"; exit 1; fi
 sleep .05
done
grep -q RECEIPT_LOCKED "$tmp/first.log"
run_sql <<'SQL'
set role authenticated;
select set_config('test.actor','11111111-1111-4111-8111-111111111111',false);
select set_config('test.workspace','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.domain_role','ADMIN',false);
do $$
declare req uuid:='ffffffff-ffff-4fff-8fff-ffffffffffff';
 receipt jsonb;
 replay jsonb;
begin
 receipt:=public.mrh_material_create_receipt(req);
 if receipt->>'status' is distinct from 'committed' then raise exception 'lookup failed to observe concurrent commit';end if;
 replay:=public.mrh_create_material_atomic(req,'Recovery race','[]','{}');
 if replay->>'created' is distinct from 'false' or replay->>'item_id' is distinct from receipt->>'item_id'
 or (select count(*) from public.work_board_items where title='Recovery race')<>1 then raise exception 'duplicate recovery race';end if;
 raise notice 'CP_MS_CRM_04A3_CONCURRENT_RECEIPT_PASS';
end$$;
reset role;
SQL
wait "$PID"
run_sql <<'SQL'
\i /tmp/mrh-rollback.sql
do $$begin
 if to_regprocedure('public.mrh_material_create_receipt(uuid)') is not null or
    to_regprocedure('public.mrh_edit_material_atomic(uuid,jsonb,jsonb)') is not null or
    to_regprocedure('public.mrh_create_material_atomic(uuid,text,jsonb,jsonb)') is null or
    (select count(*) from private.mrh_material_create_requests)<>2 or
    (select count(*) from public.work_board_items)<>2 then raise exception 'rollback altered existing data or contract'; end if;
 raise notice 'CP_MS_CRM_04A3_ADDITIVE_ROLLBACK_PASS';
end$$;
SQL
