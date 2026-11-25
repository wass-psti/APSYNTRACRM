#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="cp-tl-gm-release-$$"
docker info >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --rm --network none --name "$NAME" -e POSTGRES_PASSWORD=disposable_only -v "$ROOT:/repo:ro" postgres:17 >/dev/null
ready=false
for _ in $(seq 1 60); do
 if docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=true; break; fi
 sleep 1
done
[[ "$ready" == true ]] || { echo "Disposable PostgreSQL did not become ready" >&2; exit 1; }
# Rehearse the actual migration against the captured production function definitions
# using the same synthetic fixture, never the hosted database.
for file in \
 sql/tests/cp-tl03-disposable-setup.sql \
 sql/tests/cp-tl-create-new-02-user-fixture.sql \
 sql/cp-tl03-staged-domain.sql \
 supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql \
 supabase/migrations/20261112093727_tradelink_revision_required_edit_compat.sql \
 supabase/migrations/20261113065300_tradelink_retry_safe_revision_bound_updates.sql \
 supabase/migrations/20261116062500_cp_tl_legacy_analytics_summary.sql \
 supabase/migrations/20261116070000_cp_tl_legacy_numbering_dates_aging.sql \
 supabase/migrations/20261117020000_tradelink_immutable_revision_snapshots.sql \
 supabase/migrations/20261117045417_tradelink_approved_revision_flow.sql \
 sql/tests/cp-tl-create-new-02-user-rpc-grants.sql \
 supabase/migrations/20261119073346_tradelink_user_draft_creation.sql \
 supabase/migrations/20261119073608_tradelink_document_read_policy_consolidation.sql \
 supabase/migrations/20261119085430_cp_tl_create_new_02_user_board_projection_insert.sql \
 sql/tests/cp-tl-gm-approval-02-legacy-pending-fixture.sql \
 supabase/migrations/20261123080322_cp_tl_document_identity_order_01.sql \
 supabase/migrations/20261123103806_cp_tl_document_bulk_actions.sql; do
 echo "== $file =="
 docker exec -i "$NAME" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres -d postgres -q -f "/repo/$file"
done
echo '== Exact captured production definitions =='
docker exec -i "$NAME" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres -d postgres -q < "${CP_TL_GM_BASELINE_FILE:?Set captured baseline SQL file}"
echo '== Transactional migration =='
docker exec -i "$NAME" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres -d postgres -q -f /repo/supabase/migrations/20261125012603_cp_tl_gm_approval_exemption.sql
for file in sql/tests/cp-tl-create-new-02-user-six-module-disposable.sql sql/tests/cp-tl-gm-approval-02-policy-disposable.sql; do
 echo "== $file =="
 docker exec -i "$NAME" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres -d postgres -q -f "/repo/$file"
done
echo CP_TL_GM_APPROVAL_03_EXACT_MIGRATION_PASS
