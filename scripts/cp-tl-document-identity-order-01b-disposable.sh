#!/usr/bin/env bash
# CP-TL-DOCUMENT-IDENTITY-AND-ORDER-01B: isolated PostgreSQL 17 pagination,
# creator/reviewer merge, stable cursor and edit-position acceptance.
# This script never connects to production Supabase.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v docker >/dev/null || { echo 'Docker is required' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Docker engine is not running' >&2; exit 1; }
NAME="cp-tl-doc-identity-01b-$$"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker run -d --rm --network none --name "$NAME" \
  -e POSTGRES_PASSWORD=disposable_only -v "$ROOT:/repo:ro" postgres:17 >/dev/null
ready=false
for _ in $(seq 1 40); do
 if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
 sleep 1
done
[[ "$ready" == true ]] || { echo 'Disposable PostgreSQL 17 unavailable' >&2; exit 1; }
psql_in(){ docker exec -i "$NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
for file in \
 sql/tests/cp-tl03-disposable-setup.sql \
 sql/cp-tl03-staged-domain.sql \
 sql/tradelink-documents-page-candidate.sql \
 supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql \
 sql/tests/cp-tl-document-identity-order-01b-preflight.sql \
 supabase/migrations/20261123080322_cp_tl_document_identity_order_01.sql \
 sql/tests/cp-tl-document-identity-order-01b-disposable.sql; do
 test -f "$file"
 echo "== $file =="
 psql_in -q -f "/repo/$file"
done
echo 'CP_TL_DOCUMENT_IDENTITY_ORDER_01B_DISPOSABLE_PASS'
