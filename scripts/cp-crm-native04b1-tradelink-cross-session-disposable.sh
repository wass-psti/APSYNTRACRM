#!/usr/bin/env bash
# CP-CRM-NATIVE-04B1: synthetic independent database connections & sessions.
# All credentials/identities and transaction records belong to disposable PG17.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
NAME="cp-native04b1-tl-$$"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker info >/dev/null 2>&1 || { echo 'Docker is required'; exit 1; }
docker run -d --rm --network none --name "$NAME" \
  -e POSTGRES_PASSWORD=disposable-only -v "$ROOT:/repo:ro" postgres:17 >/dev/null
ready=false
for _ in $(seq 1 40); do
 if docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=true; break; fi
 sleep 1
done
[[ "$ready" == true ]] || { echo 'Disposable PostgreSQL unavailable' >&2; exit 1; }
psql_in(){ docker exec -i "$NAME" psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U postgres -d postgres "$@"; }
for file in \
 sql/tests/cp-tl03-disposable-setup.sql \
 sql/cp-tl03-staged-domain.sql \
 supabase/migrations/20261112091535_tradelink_for_approval_dual_review.sql \
 supabase/migrations/20261112093727_tradelink_revision_required_edit_compat.sql \
 supabase/migrations/20261113065300_tradelink_retry_safe_revision_bound_updates.sql; do
  test -f "$file"
  psql_in -q -f "/repo/$file"
done

# QA identities and second signed session exist solely in isolated database.
psql_in -q <<'SQL'
UPDATE auth.users SET
  email=CASE id
    WHEN 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' THEN 'qa-reviewer-one@example.test'
    WHEN 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' THEN 'qa-reviewer-two@example.test'
    ELSE email END,
  email_confirmed_at=clock_timestamp()
WHERE id IN ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
             'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
INSERT INTO auth.sessions(id,user_id) VALUES
 ('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SQL

# Connection A: a real SQL COMMIT by the existing synthetic manager identity.
psql_in -q <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);
DO $write$
DECLARE
  receipt jsonb;
BEGIN
  receipt:=public.tl03_document_save(
    '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
    '99999999-1111-4111-8111-111111111111',0,'create',
    jsonb_build_object(
      'documentType','quotation',
      'documentNumber','QA-ISOLATED-04B1-QUOTATION',
      'customerName','Disposable cross-session record',
      'customerEmail','customer@example.test',
      'validity','30 days','deliveryCommitment','Within 14 days',
      'paymentTerms','Net 30','currency','PHP',
      'verifiedBy','Reviewer One','verifiedByEmail','qa-reviewer-one@example.test',
      'approvedBy','Reviewer Two','approvedByEmail','qa-reviewer-two@example.test',
      'items',jsonb_build_array(jsonb_build_object(
        'id','line-one','kind','item','description','Nonproduction',
        'quantity',2,'unitPrice',150))
    ),'for-approval'
  );
  IF receipt->>'documentId'<>'99999999-1111-4111-8111-111111111111'
    OR receipt->>'revision'<>'1'
    OR receipt->>'state'<>'for-approval'
    OR receipt->>'operation'<>'create'
    OR receipt->>'idempotent'<>'false'
  THEN RAISE EXCEPTION 'Signed create receipt failed: %',receipt; END IF;
END $write$;
COMMIT;
SQL

# Connection B: same identity but separately persisted Auth session and connection.
psql_in -q <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','55555555-5555-4555-8555-555555555555',true);
DO $readback$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='99999999-1111-4111-8111-111111111111';
 saved jsonb;
 listing jsonb;
 item uuid;
BEGIN
 saved:=public.tl03_document_read(board,doc);
 listing:=public.tl03_documents_page(board,'','all','all','active',NULL,NULL,50);
 item:=(saved->>'board_item_id')::uuid;
 IF saved->>'revision'<>'1'
   OR saved->>'workflow_state'<>'for-approval'
   OR saved->'content'->>'customerName'<>'Disposable cross-session record'
   OR (SELECT count(*) FROM jsonb_array_elements(listing->'rows') r
     WHERE r->>'documentId'=doc::text
       AND r->>'boardItemId'=item::text)<>1
   OR NOT EXISTS(SELECT 1 FROM public.work_board_items
     WHERE id=item AND board_id=board)
   OR (SELECT count(*) FROM public.tradelink_document_events
     WHERE document_id=doc)<>1
 THEN RAISE EXCEPTION 'Independent second session readback differs from committed source'; END IF;
END $readback$;
COMMIT;
SQL

# Connection C: distinct authorized reviewer reads their assigned document.
psql_in -q <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','22222222-2222-4222-8222-222222222222',true);
DO $reviewer$
DECLARE saved jsonb;
BEGIN
 saved:=public.tl03_document_read_assigned(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '99999999-1111-4111-8111-111111111111');
 IF saved IS NULL OR saved->>'revision'<>'1'
 OR saved->'content'->>'documentNumber'<>'QA-ISOLATED-04B1-QUOTATION'
 THEN RAISE EXCEPTION 'Assigned reviewer session did not read committed document: %',saved; END IF;
END $reviewer$;
COMMIT;
SQL

# Connection D: third-party workspace identity remains denied.
psql_in -q <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','44444444-4444-4444-8444-444444444444',true);
DO $denied$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  PERFORM public.tl03_document_read(
    '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
    '99999999-1111-4111-8111-111111111111');
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Foreign session unexpectedly read QA document'; END IF;
END $denied$;
COMMIT;
SQL

# Independent last connection verifies that no duplicate DB rows or approvals
# were introduced by the read operations.
psql_in -qAt <<'SQL'
DO $integrity$
BEGIN
 IF (SELECT count(*) FROM public.tradelink_documents
     WHERE id='99999999-1111-4111-8111-111111111111')<>1
 OR (SELECT count(*) FROM public.tradelink_document_events
     WHERE document_id='99999999-1111-4111-8111-111111111111')<>1
 OR EXISTS(SELECT 1 FROM private.tradelink_document_reviews
     WHERE document_id='99999999-1111-4111-8111-111111111111')
 THEN RAISE EXCEPTION 'Independent session test modified provenance unexpectedly'; END IF;
END $integrity$;
SQL
echo 'CP_CRM_NATIVE04B1_CROSS_SESSION_DISPOSABLE_PASS'
