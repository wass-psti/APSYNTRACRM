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
select public.mrh_edit_material_atomic((select id from public.work_board_items where title='Ordinary'),
 '[{"column_id":null,"value":"Concurrent winner","expected_value":"Ordinary"}]',
 '[{"field_name":"Buying Price","value":20,"expected_revision":2}]');
\echo LOCKED
select pg_sleep(2);
commit;
SQL
run_sql <"$tmp/first.sql" >"$tmp/first.log" 2>&1 &
PID=$!
for i in $(seq 1 80); do
 if grep -q LOCKED "$tmp/first.log"; then break; fi
 if ! kill -0 "$PID" 2>/dev/null; then cat "$tmp/first.log"; exit 1; fi
 sleep .05
done
grep -q LOCKED "$tmp/first.log"
run_sql <<'SQL'
set role authenticated;
select set_config('test.actor','11111111-1111-4111-8111-111111111111',false);
select set_config('test.workspace','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.domain_role','ADMIN',false);
do $$
declare target uuid:=(select id from public.work_board_items limit 1);
begin
 begin
  perform public.mrh_edit_material_atomic(target,'[{"column_id":null,"value":"Concurrent loser","expected_value":"Ordinary"}]','[{"field_name":"Buying Price","value":99,"expected_revision":2}]');
  raise exception 'stale concurrent edit accepted';
 exception when sqlstate 'PT409' then null; end;
 if (select title from public.work_board_items where id=target) is distinct from 'Concurrent winner'
 or public.test_private_value(target,'Buying Price') is distinct from '{"value":20,"revision":3}'::jsonb then raise exception 'concurrent readback mismatch'; end if;
 raise notice 'CP_MS_CRM_04A2_CONCURRENT_CAS_PASS';
end $$;
SQL
wait "$PID"
