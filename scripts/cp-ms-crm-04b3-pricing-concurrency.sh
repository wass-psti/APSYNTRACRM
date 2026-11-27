#!/usr/bin/env bash
# Disposable PostgreSQL only. Separate sessions exercise actual row/FK waits.
set -euo pipefail
name="$1"
test "$name" = ms-crm02-pricing
psql_cmd=(docker exec -i "$name" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
i=55555555-5555-4555-8555-555555555555
j=66666666-6666-4666-8666-666666666666
fx="$("${psql_cmd[@]}" -c "select id from private.mrh_fx_snapshots where item_id='$i' and observation_ref='pricing-concurrent'")"
state="$("${psql_cmd[@]}" -c "select private.mrh_pricing_input_state('$i','$fx')")"
call="select private.mrh_pricing_persist('$i','$fx',\$state\$$state\$state\$)->>'pricingVersionId';"
wait_query() {
 local predicate="$1"
 for _ in $(seq 1 80); do
  if [ "$("${psql_cmd[@]}" -c "select count(*) from pg_stat_activity where pid<>pg_backend_pid() and $predicate")" = 1 ]; then return 0; fi
  sleep 0.05
 done
 return 1
}
# Two identical persisted quotes. Second must wait on material lock.
printf '%s\n' 'begin;' "$call" 'select pg_sleep(8);' 'commit;' | "${psql_cmd[@]}" > "$dir/first" &
first=$!
wait_query "wait_event='PgSleep' and query like 'select pg_sleep(8)%'"
"${psql_cmd[@]}" -c "$call" > "$dir/second" &
second=$!
wait_query "wait_event_type='Lock' and query like 'select private.mrh_pricing_persist(%'"
wait "$first"
wait "$second"
a="$(grep -E '^[0-9a-f-]{36}$' "$dir/first")"
b="$(cat "$dir/second")"
test -n "$a" && test "$a" = "$b"
test "$("${psql_cmd[@]}" -c "select count(*) from private.mrh_pricing_versions where item_id='$i'")" = 1
echo CP_MS_CRM_04B3_CONCURRENT_REPLAY_PASS
# A direct existing-cell writer holds no parent lock. Persist must wait
# for the row and then reject the stale expected state after commit.
update="update private.mrh_sourcing_sensitive_cells set value='121',revision=revision+1 where item_id='$i' and field_name='Buying Price';"
printf '%s\n' 'begin;' "$update" 'select pg_sleep(8);' 'commit;' | "${psql_cmd[@]}" > "$dir/writer" &
writer=$!
wait_query "wait_event='PgSleep' and query like 'select pg_sleep(8)%'"
set +e
"${psql_cmd[@]}" -c "$call" > "$dir/stale" 2>&1 &
stale=$!
set -e
wait_query "wait_event_type='Lock' and query like 'select private.mrh_pricing_persist(%'"
wait "$writer"
if wait "$stale"; then echo 'stale persist unexpectedly succeeded'; exit 1; fi
grep -q 'Pricing inputs changed' "$dir/stale"
test "$("${psql_cmd[@]}" -c "select count(*) from private.mrh_pricing_versions where item_id='$i'")" = 1
echo CP_MS_CRM_04B3_DIRECT_WRITER_STALE_PASS
# An absent public cell cannot be inserted while the quote holds the parent
# row lock; the FK wait proves the no-phantom dependency in this fixture.
missing="$("${psql_cmd[@]}" -c "select private.mrh_pricing_input_state('$j',null)")"
missing_call="select private.mrh_pricing_persist('$j',null,\$state\$$missing\$state\$)->>'pricingVersionId';"
printf '%s\n' 'begin;' "$missing_call" 'select pg_sleep(8);' 'commit;' | "${psql_cmd[@]}" > "$dir/missing" &
quote=$!
wait_query "wait_event='PgSleep' and query like 'select pg_sleep(8)%'"
insert="insert into public.work_board_item_values(item_id,column_id,value) values('$j','10000000-0000-4000-8000-000000000001','4');"
"${psql_cmd[@]}" -c "$insert" > "$dir/insert" &
inserter=$!
wait_query "wait_event_type='Lock' and query like 'insert into public.work_board_item_values(%'"
wait "$quote"
wait "$inserter"
if "${psql_cmd[@]}" -c "$missing_call" > "$dir/old" 2>&1; then echo 'missing-state replay unexpectedly succeeded'; exit 1; fi
grep -q 'Pricing inputs changed' "$dir/old"
test "$("${psql_cmd[@]}" -c "select count(*) from private.mrh_pricing_versions where item_id='$j'")" = 1
echo CP_MS_CRM_04B3_MISSING_CELL_SERIALIZATION_PASS
