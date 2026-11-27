#!/usr/bin/env bash
# Disposable container only; run two independent PostgreSQL sessions.
set -euo pipefail
name="$1"
test "$name" = ms-crm02-pricing
psql_cmd=(docker exec -i "$name" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq)
call="select private.mrh_fx_capture_provider('11111111-1111-4111-8111-111111111111','67.12345678','73.12345678','Synthetic provider','concurrent','2026-01-03','2026-01-04');"
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
# Hold the first transaction until an independent session observes its lock wait.
printf '%s\n' 'begin;' "$call" 'select pg_sleep(8);' 'commit;' | "${psql_cmd[@]}" > "$dir/first" &
first=$!
ready=0
for i in $(seq 1 60); do
 if [ "$("${psql_cmd[@]}" -c "select count(*) from pg_stat_activity where wait_event='PgSleep' and query like 'select pg_sleep(8)%'")" = 1 ]; then ready=1; break; fi
 sleep 0.05
done
test "$ready" = 1
"${psql_cmd[@]}" -c "$call" > "$dir/second" &
second=$!
blocked=0
for i in $(seq 1 60); do
 if [ "$("${psql_cmd[@]}" -c "select count(*) from pg_stat_activity where wait_event_type='Lock' and query like 'select private.mrh_fx_capture_provider(%concurrent%'")" = 1 ]; then blocked=1; break; fi
 sleep 0.05
done
wait "$first"
wait "$second"
test "$blocked" = 1
a="$(grep -E '^[0-9a-f-]{36}$' "$dir/first")"
b="$(cat "$dir/second")"
test -n "$a" && test "$a" = "$b"
test "$("${psql_cmd[@]}" -c "select count(*) from private.mrh_fx_snapshots where observation_ref='concurrent'")" = 1
echo CP_MS_CRM_04B2_CONCURRENT_REPLAY_PASS
