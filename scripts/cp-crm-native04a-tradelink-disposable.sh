#!/usr/bin/env bash
# CP-CRM-NATIVE-04A: isolated TradeLink six-module signed persistence, readback,
# reviewer transitions, immutable approved revisions and exact replay.
# Disposable PostgreSQL 17 ONLY; no production host, credentials or records.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v docker >/dev/null || { echo "Docker is required" >&2; exit 1; }
NAME="cp-native04a-tl-$$"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run -d --rm --network none --name "$NAME" \
  -e POSTGRES_PASSWORD=disposable_only \
  -v "$ROOT:/repo:ro" postgres:17 >/dev/null
ready=false
for _ in $(seq 1 35); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo "Disposable PostgreSQL 17 unavailable" >&2; exit 1; }
psql_in(){ local db="$1"; shift; docker exec "$NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$db" "$@"; }
apply(){ local db="$1" file="$2"; test -f "$file"; psql_in "$db" -q -f "/repo/$file"; }
create_db(){ docker exec "$NAME" createdb -U postgres "$1"; }

echo "== TradeLink signed save, six documents, readback and revision isolation =="
create_db tl_save
for f in \
  sql/tests/cp-tl03-disposable-setup.sql \
  sql/cp-tl03-staged-domain.sql \
  supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql \
  supabase/migrations/20261112093727_tradelink_revision_required_edit_compat.sql \
  supabase/migrations/20261113065300_tradelink_retry_safe_revision_bound_updates.sql \
  sql/tests/cp-tl08e02-retry-safe-updates-disposable.sql \
  sql/tests/cp-tl10a-six-module-signed-save-disposable.sql; do
  apply tl_save "$f"
done

echo "== TradeLink independent primary/secondary review and denial =="
create_db tl_review
for f in \
  sql/tests/cp-tl03-disposable-setup.sql \
  sql/cp-tl03-staged-domain.sql \
  supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql \
  sql/tests/cp-tl08h-virtual-review-acceptance.sql; do
  apply tl_review "$f"
done

echo "== TradeLink immutable Approved revision, supersession, replay and historical readback =="
create_db tl_revision
for f in \
  sql/tests/cp-tl03-disposable-setup.sql \
  sql/cp-tl03-staged-domain.sql \
  supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql \
  supabase/migrations/20261112093727_tradelink_revision_required_edit_compat.sql \
  supabase/migrations/20261113065300_tradelink_retry_safe_revision_bound_updates.sql \
  sql/tests/cp-tl-revision-history-fixture.sql \
  sql/tests/cp-tl-rh08-legacy-approved-fixture.sql \
  supabase/migrations/20261117020000_tradelink_immutable_revision_snapshots.sql \
  supabase/migrations/20261117045417_tradelink_approved_revision_flow.sql \
  sql/tests/cp-tl-rh08-approved-revision-disposable.sql; do
  apply tl_revision "$f"
done
echo "CP_CRM_NATIVE04A_TRADELINK_DISPOSABLE_PASS"
