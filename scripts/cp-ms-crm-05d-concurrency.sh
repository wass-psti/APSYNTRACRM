#!/usr/bin/env bash
set -euo pipefail
NAME="$1"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
command() {
  local op="$1" quote="$2"
  docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q <<SQL
set role authenticated;
select set_config('test.actor','11111111-1111-4111-8111-111111111111',false);
select set_config('test.workspace','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.domain_role','ADMIN',false);
select set_config('test.order_access','yes',false);
select public.mrh_procurement_apply('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','$op',9,'select_quote',jsonb_build_object('quote_id','$quote','reason','concurrent selection'));
SQL
}
# Both actors reviewed the same RFQ revision. Exactly one must succeed.
set +e
command '66666666-6666-4666-8666-666666666661' '55555555-5555-4555-8555-555555555555' >"$tmp/a" 2>&1 &
a=$!
command '66666666-6666-4666-8666-666666666662' '55555555-5555-4555-8555-555555555556' >"$tmp/b" 2>&1 &
b=$!
wait "$a"; x=$?
wait "$b"; y=$?
set -e
cat "$tmp/a" "$tmp/b"
if ! { [[ "$x" = 0 && "$y" != 0 ]] || [[ "$y" = 0 && "$x" != 0 ]]; }; then exit 1; fi
grep -q 'RFQ revision conflict' "$tmp/a" "$tmp/b"
docker exec -i "$NAME" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin
 if (select count(*) from private.mrh_procurement_revisions)<>10 or
 (select count(*) from public.work_board_events where event_type='sourcing.procurement_changed')<>10 or
 (select snapshot->>'status' from private.mrh_procurement_revisions where revision=10)<>'selected'
 then raise exception 'concurrent selection integrity failed'; end if;
end $$;
select 'CP_MS_CRM_05D_CONCURRENT_SELECTION_PASS';
SQL
