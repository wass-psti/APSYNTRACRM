#!/usr/bin/env bash
set -euo pipefail
# Disposable CI database only. Two independent authenticated psql connections.
psqlq(){ psql -X -v ON_ERROR_STOP=1 -Atq "$@"; }
w=00000000-0000-4000-8000-000000000001
a=00000000-0000-4000-8000-000000000011
b=00000000-0000-4000-8000-000000000012
sa=00000000-0000-4000-8000-000000000301
sb=00000000-0000-4000-8000-000000000302
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
revision=$(psqlq -c "select revision from dda.workspace_state where workspace_id='$w'")
submit(){
  local actor=$1 sid=$2 request=$3 rev=$4 category=$5 name=$6
  psqlq <<SQL
set role authenticated;
set request.jwt.claim.sub='$actor';
set request.jwt.claim.session_id='$sid';
select public.dda_submit_v1('$w','$request',$rev,'save-category',jsonb_build_object('id','$category','name','$name'));
SQL
}
r1=00000000-0000-4000-8000-000000000501
r2=00000000-0000-4000-8000-000000000502
c1=00000000-0000-4000-8000-000000000511
c2=00000000-0000-4000-8000-000000000512
submit "$a" "$sa" "$r1" "$revision" "$c1" 'Concurrent A' >"$tmp/a" &
p1=$!
submit "$b" "$sb" "$r2" "$revision" "$c2" 'Concurrent B' >"$tmp/b" &
p2=$!
wait "$p1"
wait "$p2"
[[ $(psqlq -c "select count(*) from dda.command_receipt where request_id in ('$r1','$r2') and committed_revision is not null") == 1 ]]
[[ $(psqlq -c "select count(*) from dda.command_receipt where request_id in ('$r1','$r2') and rejection_reason is not null") == 1 ]]
[[ $(psqlq -c "select count(*) from dda.category where id in ('$c1','$c2')") == 1 ]]
[[ $(psqlq -c "select revision from dda.workspace_state where workspace_id='$w'") == "$((revision+1))" ]]
echo 'PASS: independent concurrent stale-revision writers commit exactly one change'
revision=$((revision+1))
r3=00000000-0000-4000-8000-000000000503
c3=00000000-0000-4000-8000-000000000513
submit "$a" "$sa" "$r3" "$revision" "$c3" 'Same request' >"$tmp/c" &
p1=$!
submit "$a" "$sa" "$r3" "$revision" "$c3" 'Same request' >"$tmp/d" &
p2=$!
wait "$p1"
wait "$p2"
[[ $(psqlq -c "select count(*) from dda.command_receipt where request_id='$r3' and committed_revision is not null") == 1 ]]
[[ $(psqlq -c "select count(*) from dda.activity_event where request_id='$r3'") == 1 ]]
[[ $(psqlq -c "select count(*) from dda.category where id='$c3'") == 1 ]]
[[ $(psqlq -c "select revision from dda.workspace_state where workspace_id='$w'") == "$((revision+1))" ]]
grep -q '"replayed": true' "$tmp/c" "$tmp/d"
echo 'PASS: simultaneous exact-request replay produces one receipt, one event and one record'
