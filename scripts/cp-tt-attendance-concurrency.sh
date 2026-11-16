#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to the disposable PostgreSQL service}"
: "${PGPORT:?PGPORT must point to the disposable PostgreSQL service}"
: "${PGUSER:?PGUSER must identify the disposable PostgreSQL owner}"
: "${PGDATABASE:?PGDATABASE must identify the disposable database}"
: "${PGPASSWORD:?PGPASSWORD must identify the disposable database password}"

actor='20000000-0000-4000-8000-000000000002'
session='70000000-0000-4000-8000-000000000002'
board='30000000-0000-4000-8000-000000000001'
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

race_action() {
  local action="$1"
  local record_id="${2:-}"
  local latitude="$3"
  local sql
  local p1 p2 rc1 rc2 success_count failure_count

  sql=$(cat <<SQL
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','${actor}',false);
SELECT set_config('request.jwt.claim.session_id','${session}',false);
SELECT set_config('app.tt_test_lock_delay','on',false);
SELECT pg_sleep(0.15);
SELECT public.timetracker_attendance_commit_v2(
 '${board}'::uuid,
 '${action}',
 $(if [[ -n "$record_id" ]]; then printf "'%s'" "$record_id"; else printf 'NULL'; fi),
 'Office-Base Duty','HR',
 jsonb_build_object(
  'status','captured','source','browser-geolocation',
  'latitude',${latitude},'longitude',123.9,'accuracy',12.0,
  'capturedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 ),NULL
)->>'mode';
RESET ROLE;
SQL
)

  psql -X -v ON_ERROR_STOP=1 -qAt -c "$sql" >"$tmpdir/${action}-1.out" 2>"$tmpdir/${action}-1.err" &
  p1=$!
  psql -X -v ON_ERROR_STOP=1 -qAt -c "$sql" >"$tmpdir/${action}-2.out" 2>"$tmpdir/${action}-2.err" &
  p2=$!

  set +e
  wait "$p1"; rc1=$?
  wait "$p2"; rc2=$?
  set -e

  success_count=0
  failure_count=0
  [[ "$rc1" -eq 0 ]] && success_count=$((success_count+1)) || failure_count=$((failure_count+1))
  [[ "$rc2" -eq 0 ]] && success_count=$((success_count+1)) || failure_count=$((failure_count+1))
  if [[ "$success_count" -ne 1 || "$failure_count" -ne 1 ]]; then
    echo "FAIL: ${action} race expected one commit and one duplicate rejection (exit codes ${rc1}, ${rc2})" >&2
    cat "$tmpdir/${action}-1.err" "$tmpdir/${action}-2.err" >&2
    return 1
  fi

  local errors
  errors="$(cat "$tmpdir/${action}-1.err" "$tmpdir/${action}-2.err")"
  if [[ "$action" == 'clock-in' ]]; then
    grep -q 'Already active' <<<"$errors" || {
      echo 'FAIL: losing Clock-In request was not rejected by the active-session guard' >&2
      return 1
    }
  else
    grep -q 'No active matching session' <<<"$errors" || {
      echo 'FAIL: losing Clock-Out request was not rejected by the completed-session guard' >&2
      return 1
    }
  fi
  grep -q 'COMMITTED' "$tmpdir/${action}-1.out" "$tmpdir/${action}-2.out" || {
    echo "FAIL: winning ${action} request did not return a committed receipt" >&2
    return 1
  }
}

race_action 'clock-in' '' '10.2'
record_id="$(psql -X -v ON_ERROR_STOP=1 -qAt -c \
  "SELECT record->>'id' FROM public.tt_test_attendance_source WHERE employee_id='${actor}'::uuid")"
[[ -n "$record_id" ]] || { echo 'FAIL: no signed Clock-In source record was created' >&2; exit 1; }
race_action 'clock-out' "$record_id" '10.3'

psql -X -v ON_ERROR_STOP=1 -q -c "
DO \$accept\$
DECLARE
 v_source jsonb;
 v_projection private.tt_attendance_board_projection%ROWTYPE;
BEGIN
 SELECT record INTO v_source FROM public.tt_test_attendance_source
  WHERE employee_id='${actor}'::uuid;
 SELECT * INTO v_projection FROM private.tt_attendance_board_projection
  WHERE board_id='${board}'::uuid AND record_id='${record_id}'::uuid;
 IF v_source IS NULL OR pg_catalog.jsonb_typeof(v_source->'clockOut')<>'object' THEN
  RAISE EXCEPTION 'Clock-In/Clock-Out source lifecycle is incomplete';
 END IF;
 IF (SELECT count(*) FROM public.timetracker_attendance_mutation_audit
     WHERE actor_id='${actor}'::uuid AND board_id='${board}'::uuid)<>2
 OR (SELECT count(*) FROM public.timetracker_attendance_mutation_audit
     WHERE actor_id='${actor}'::uuid AND board_id='${board}'::uuid AND action='clock-in')<>1
 OR (SELECT count(*) FROM public.timetracker_attendance_mutation_audit
     WHERE actor_id='${actor}'::uuid AND board_id='${board}'::uuid AND action='clock-out')<>1 THEN
  RAISE EXCEPTION 'Duplicate attendance audit event detected';
 END IF;
 IF v_projection.record_id IS NULL OR v_projection.source_revision<>2
 OR v_projection.clock_out_at IS NULL OR coalesce(v_projection.credited_ms,0)<=0
 OR v_projection.clock_in_geo IS NOT DISTINCT FROM v_projection.clock_out_geo THEN
  RAISE EXCEPTION 'Attendance board projection or independent GPS fixes are incomplete';
 END IF;
 IF (SELECT count(*) FROM public.work_board_items
     WHERE board_id='${board}'::uuid AND id=v_projection.board_item_id)<>1 THEN
  RAISE EXCEPTION 'Attendance projection did not retain exactly one board item';
 END IF;
END
\$accept\$;
"

echo 'CP-TT-FM1-APP-03 PASS: concurrent duplicate Clock-In and Clock-Out; one source session, one audit event per action, one board item, independent GPS fixes.'
