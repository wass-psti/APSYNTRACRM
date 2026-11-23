#!/usr/bin/env bash
# CP-TT-FLOW-01F: real PostgreSQL transaction acceptance in two independent
# disposable PG17 containers. Never connects to production or publishes ports.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v docker >/dev/null || { echo 'Docker is required' >&2; exit 1; }
for f in \
  sql/tests/cp-tt-ot02-disposable-setup.sql \
  sql/cp-tt-ot01-staged-bootstrap-approval.sql \
  supabase/migrations/20261123160000_cp_tt_manual_ot_01_manual_submission_and_scoped_review.sql \
  supabase/migrations/20261123170000_cp_tt_hr_ot_all_user_log_01.sql \
  sql/tests/cp-tt-ot02-disposable-acceptance.sql \
  sql/tests/cp-board-collab01-disposable-setup.sql \
  sql/tests/cp-tt-gps01-disposable-setup.sql \
  sql/tests/cp-tt-gps01-live-commit-baseline.sql \
  sql/cp-tt-gps01-atomic-board-projection.sql \
  sql/tests/cp-tt-gps01-disposable-acceptance.sql \
  scripts/cp-tt-attendance-concurrency.sh; do
  test -f "$root/$f" || { echo "Missing fixture: $f" >&2; exit 1; }
done

container=''
cleanup() {
  if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

start_disposable() {
  local suite="$1" ready=''
  container="cp-tt-flow01f-${suite}-$$"
  docker run --detach --rm --network none --name "$container" \
    -e POSTGRES_PASSWORD=disposable_only \
    -v "$root:/repo:ro" postgres:17 >/dev/null
  for _ in $(seq 1 30); do
    if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
      ready=yes
      break
    fi
    sleep 1
  done
  if [[ "$ready" != yes ]]; then echo "Disposable $suite PostgreSQL not ready" >&2; exit 1; fi
}
stop_disposable() {
  docker rm -f "$container" >/dev/null
  container=''
}

start_disposable ot
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -q \
  -U postgres -d postgres \
  -f /repo/sql/tests/cp-tt-ot02-disposable-setup.sql \
  -f /repo/sql/cp-tt-ot01-staged-bootstrap-approval.sql \
  -f /repo/supabase/migrations/20261123160000_cp_tt_manual_ot_01_manual_submission_and_scoped_review.sql \
  -f /repo/supabase/migrations/20261123170000_cp_tt_hr_ot_all_user_log_01.sql \
  -f /repo/supabase/migrations/20261123180000_cp_tt_bootstrap_ot_self_review_01.sql \
  -f /repo/sql/tests/cp-tt-ot02-disposable-acceptance.sql \
  | grep -F 'CP-TT-MANUAL-OT-01 disposable acceptance PASS'
stop_disposable

# Separate PostgreSQL cluster is necessary: roles exist cluster-wide, not per
# database, so combining the fixtures inside one cluster contaminates setup.
start_disposable clock
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -q \
  -U postgres -d postgres \
  -f /repo/sql/tests/cp-board-collab01-disposable-setup.sql \
  -f /repo/sql/tests/cp-tt-gps01-disposable-setup.sql \
  -f /repo/sql/tests/cp-tt-gps01-live-commit-baseline.sql \
  -f /repo/sql/cp-tt-gps01-atomic-board-projection.sql \
  -f /repo/sql/tests/cp-tt-gps01-disposable-acceptance.sql
docker exec -e PGHOST=/var/run/postgresql -e PGPORT=5432 \
  -e PGUSER=postgres -e PGDATABASE=postgres -e PGPASSWORD=disposable_only \
  "$container" bash /repo/scripts/cp-tt-attendance-concurrency.sh
stop_disposable
echo 'CP_TT_FLOW01F_DISPOSABLE_ACCEPTANCE_PASS'
