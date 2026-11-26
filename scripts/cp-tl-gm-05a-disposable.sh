#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="cp-tl-gm-policy-$$"
docker info >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --rm --network none --name "$NAME" -e POSTGRES_PASSWORD=disposable_only -v "$ROOT:/repo:ro" postgres:17 >/dev/null
ready=false
for _ in $(seq 1 60); do
 if docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=true; break; fi
 sleep 1
done
[[ "$ready" == true ]] || { echo "Disposable PostgreSQL did not become ready" >&2; exit 1; }
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
 sql/candidates/cp-tl-gm-approval-02-policy.sql \
 sql/candidates/cp-tl-gm-approval-02-review.sql \
 sql/candidates/cp-tl-gm-approval-02-history.sql \
 sql/candidates/cp-tl-gm-approval-02-save.sql \
 sql/tests/cp-tl-create-new-02-user-six-module-disposable.sql \
 supabase/migrations/20261123080322_cp_tl_document_identity_order_01.sql \
 supabase/migrations/20261123103806_cp_tl_document_bulk_actions.sql \
 sql/candidates/cp-tl-gm-approval-02-list.sql \
 sql/tests/cp-tl-gm-approval-02-policy-disposable.sql; do
 echo "== $file =="
 docker exec -i "$NAME" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres -d postgres -q -f "/repo/$file"
done
for file in sql/candidates/cp-tl-gm-05a-production-baseline.sql supabase/migrations/20261126045855_cp_tl_gm_direct_executive_approval.sql sql/tests/cp-tl-gm-05a-direct-executive-disposable.sql; do
 echo "== $file =="
 docker exec -i "$NAME" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres -d postgres -q -f "/repo/$file"
done
# Compare all exempt review evidence before and after a logical restore and selector-only rollback.
evidence() {
 docker exec "$NAME" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres -d "$1" -At -c "SELECT s.document_id,s.revision,s.document_type,r.stage,r.actor_id,r.assigned_email,r.recorded_at,private.tl03_approval_evidence_complete(s.document_id,s.revision) FROM private.tradelink_document_revision_snapshots s JOIN private.tradelink_revision_approval_exemptions e ON e.document_id=s.document_id AND e.revision=s.revision JOIN private.tradelink_document_reviews r ON r.document_id=s.document_id AND r.document_revision=s.revision ORDER BY s.document_id,s.revision,r.stage"
}
before="$(evidence postgres)"
[[ -n "$before" ]] || { echo "Missing review evidence" >&2; exit 1; }
docker exec "$NAME" pg_dump -h 127.0.0.1 -U postgres -Fc -d postgres -f /tmp/gm-recovery.dump
docker exec "$NAME" createdb -h 127.0.0.1 -U postgres gm_recovery
docker exec "$NAME" pg_restore -h 127.0.0.1 -U postgres --exit-on-error -d gm_recovery /tmp/gm-recovery.dump
[[ "$(evidence gm_recovery)" == "$before" ]] || { echo "Restored evidence mismatch" >&2; exit 1; }
echo CP_TL_GM_05A_BACKUP_RESTORE_EVIDENCE_PASS
docker exec "$NAME" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres -d gm_recovery -q -f /repo/sql/tests/cp-tl-gm-05a-selector-rollback.sql
[[ "$(evidence gm_recovery)" == "$before" ]] || { echo "Rollback evidence mismatch" >&2; exit 1; }
echo CP_TL_GM_05A_SELECTOR_ROLLBACK_EVIDENCE_PASS
echo CP_TL_GM_APPROVAL_05A_DISPOSABLE_PASS
