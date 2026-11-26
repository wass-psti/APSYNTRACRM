#!/usr/bin/env bash
# CP-TL-CREATE-NEW-02: existing TradeLink User, Board Viewer-only six-module
# create/number/read/update/Board/All Documents/revision acceptance.
# Disposable PostgreSQL 17 only; no production host, credentials or records.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v docker >/dev/null || { echo "BLOCKED: Docker is required" >&2; exit 1; }
python3 - <<'PY'
import subprocess
import sys
try:
    result = subprocess.run(['docker', 'info'], stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, timeout=8, check=False)
except (FileNotFoundError, subprocess.TimeoutExpired):
    print('BLOCKED: Docker engine is not responding', file=sys.stderr)
    raise SystemExit(1)
if result.returncode:
    print('BLOCKED: Docker engine is not running', file=sys.stderr)
    raise SystemExit(1)
PY
NAME="cp-tl-create-new-02-$$"
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
[[ "$ready" == true ]] || { echo "BLOCKED: disposable PostgreSQL 17 unavailable" >&2; exit 1; }
docker exec "$NAME" createdb -U postgres tl_create_new_02
psql_in(){ docker exec "$NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d tl_create_new_02 "$@"; }
apply(){ local file="$1"; test -f "$file"; psql_in -q -f "/repo/$file"; }

apply sql/tests/cp-tl03-disposable-setup.sql
apply sql/tests/cp-tl-create-new-02-user-fixture.sql
apply sql/cp-tl03-staged-domain.sql
apply supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql
apply supabase/migrations/20261112093727_tradelink_revision_required_edit_compat.sql
apply supabase/migrations/20261113065300_tradelink_retry_safe_revision_bound_updates.sql
apply supabase/migrations/20261116062500_cp_tl_legacy_analytics_summary.sql
apply supabase/migrations/20261116070000_cp_tl_legacy_numbering_dates_aging.sql
apply supabase/migrations/20261117020000_tradelink_immutable_revision_snapshots.sql
apply supabase/migrations/20261117045417_tradelink_approved_revision_flow.sql
apply sql/tests/cp-tl-create-new-02-user-rpc-grants.sql
apply supabase/migrations/20261119073346_tradelink_user_draft_creation.sql
apply supabase/migrations/20261119073608_tradelink_document_read_policy_consolidation.sql
apply supabase/migrations/20261119085430_cp_tl_create_new_02_user_board_projection_insert.sql
apply sql/tests/cp-tl-create-new-02-user-six-module-disposable.sql
# Upgrade the disposable fixture to the current All Documents, bulk-action,
# and original-creator contracts before testing shared reads across roles.
apply supabase/migrations/20261123080322_cp_tl_document_identity_order_01.sql
apply supabase/migrations/20261123103806_cp_tl_document_bulk_actions.sql
apply supabase/migrations/20261125071129_cp_tl_document_creator_identification_01.sql
apply supabase/migrations/20261126093000_cp_tl_shared_document_visibility_01.sql
apply sql/tests/cp-tl-shared-document-visibility-disposable.sql

echo "CP_TL_SHARED_DOCUMENT_VISIBILITY_01_DISPOSABLE_PASS"
