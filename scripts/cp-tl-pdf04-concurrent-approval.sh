#!/usr/bin/env bash
# Requires already isolated disposable PostgreSQL fixture, never production.
set -euo pipefail
[[ "${PGHOST:-}" == '127.0.0.1' && "${PGDATABASE:-}" == 'tradelink_disposable' ]] || {
 echo 'BLOCKED: disposable PostgreSQL identity required' >&2; exit 2;
}
psql -X -v ON_ERROR_STOP=1 -Atqc "SELECT current_database(), current_setting('server_version_num')::integer >= 170000" | grep -Fx 'tradelink_disposable|t'
psql -X -v ON_ERROR_STOP=1 -f sql/tests/cp-tl-pdf04-concurrency-setup.sql >/dev/null
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
query="BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true); SELECT set_config('request.jwt.claim.session_id','22222222-2222-4222-8222-222222222222',true); SELECT pg_sleep(0.3); SELECT public.tl03_record_pdf_approval_stage('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','66666666-6666-4666-8666-666666666667',3,'primary'); COMMIT;"
pids=()
for i in 1 2; do
 (psql -X -v ON_ERROR_STOP=1 -Atqc "$query" >"$workdir/$i.out" 2>"$workdir/$i.err") &
 pids+=("$!")
done
passed=0; failed=0
for pid in "${pids[@]}"; do
 if wait "$pid"; then passed=$((passed+1)); else failed=$((failed+1)); fi
done
if [[ "$passed" != 1 || "$failed" != 1 ]]; then
 echo "FAIL: concurrent approval outcomes successes=$passed failures=$failed" >&2
 cat "$workdir"/*.err >&2; exit 1
fi
if ! grep -q 'duplicate key value violates unique constraint' "$workdir"/*.err; then
 echo 'FAIL: losing contender was not rejected by uniqueness guard' >&2
 cat "$workdir"/*.err >&2; exit 1
fi
count=$(psql -X -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM private.tradelink_pdf_approval_events WHERE document_id='66666666-6666-4666-8666-666666666667' AND document_revision=3 AND stage='primary'")
[[ "$count" == '1' ]] || { echo "FAIL: expected one durable event, observed $count" >&2; exit 1; }
echo 'PASS: 2 concurrent signed attempts => 1 committed event, 1 duplicate denial'
