#!/usr/bin/env bash
# CP-BOARD-BULK02 disposable-only PG17 two-connection CAS contention test.
set -euo pipefail
board='30000000-0000-4000-8000-000000000001'
group='60000000-0000-4000-8000-000000000001'
expected="$(psql -At -v ON_ERROR_STOP=1 -c \
 "SELECT updated_at::text FROM public.work_board_groups WHERE id='$group'")"
test -n "$expected"
log1="$(mktemp)"
log2="$(mktemp)"
trap 'rm -f "$log1" "$log2"' EXIT
# Connection A holds the same board-wide advisory lock as the signed CAS RPC.
psql -v ON_ERROR_STOP=1 >"$log1" 2>&1 <<SQL &
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('$board',0));
SELECT pg_sleep(1.8);
UPDATE public.work_board_groups SET title='Concurrent winner',
 updated_at=clock_timestamp() WHERE id='$group';
COMMIT;
SQL
writer_pid=$!
held=''
for i in $(seq 1 80); do
 held="$(psql -At -v ON_ERROR_STOP=1 -c \
  "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND granted AND pid<>pg_backend_pid())")"
 if [[ "$held" == "t" ]]; then break; fi
 sleep 0.025
done
if [[ "$held" != "t" ]]; then
 cat "$log1"
 echo "FAIL: competing transaction never acquired board lock" >&2
 wait "$writer_pid" || true
 exit 1
fi
# Connection B is an actual authorized editor with synthetic disposable session claims.
# It must wait for A, then reject its now-stale group updated_at.
if psql -v ON_ERROR_STOP=1 -v expected_at="$expected" >"$log2" 2>&1 <<'SQL'
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000002',false);
SELECT public.wm_board_group_cas(
 '30000000-0000-4000-8000-000000000001',
 '60000000-0000-4000-8000-000000000001',
 :'expected_at'::timestamptz,
 'rename','CONCURRENT_STALE_SHOULD_NOT_WIN');
SQL
then
 echo "FAIL: stale concurrent group rename was accepted" >&2
 cat "$log2"
 wait "$writer_pid" || true
 exit 1
fi
wait "$writer_pid"
if ! grep -q 'Group changed; reload before editing' "$log2"; then
 echo "FAIL: rename denied for a reason other than stale CAS" >&2
 cat "$log2"
 exit 1
fi
actual="$(psql -At -v ON_ERROR_STOP=1 -c \
 "SELECT title FROM public.work_board_groups WHERE id='$group'")"
if [[ "$actual" != 'Concurrent winner' ]]; then
 echo "FAIL: losing writer corrupted the group title: $actual" >&2
 exit 1
fi
echo "CP-BOARD-BULK02 PASS: concurrent advisory-lock serialization and stale-group denial"
