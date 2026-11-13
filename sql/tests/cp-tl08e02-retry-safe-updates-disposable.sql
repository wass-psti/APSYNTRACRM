-- CP-TL-08E-02: retry-safe, revision-bound signed document-save acceptance.
-- Disposable PostgreSQL 17 only. The surrounding CI job creates a fresh database,
-- applies the existing signed fixture and the exact production migrations, then
-- executes this test in one transaction and rolls all synthetic records back.
\set ON_ERROR_STOP on
BEGIN;

-- Synthetic reviewer identities satisfy the existing account prerequisites;
-- this test does not add or change any production role, membership, or grant.
UPDATE auth.users
SET email=CASE id
 WHEN 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid THEN 'original-secondary@example.test'
 WHEN 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid THEN 'primary-reviewer@example.test'
END,
email_confirmed_at=pg_catalog.now()
WHERE id IN (
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
);

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','temporary-reviewer@example.test',pg_catalog.now()),
 ('12121212-1212-4212-8212-121212121212','second-manager@example.test',pg_catalog.now());
INSERT INTO public.profiles(id,status) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','active'),
 ('12121212-1212-4212-8212-121212121212','active');
INSERT INTO public.workspace_members(workspace_id,user_id) VALUES
 ('00000000-0000-4000-8000-000000000001','ffffffff-ffff-4fff-8fff-ffffffffffff'),
 ('00000000-0000-4000-8000-000000000001','12121212-1212-4212-8212-121212121212');
INSERT INTO public.module_role_assignments(user_id,module_id,role) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','tradelink','User'),
 ('12121212-1212-4212-8212-121212121212','tradelink','General Manager');
INSERT INTO public.work_board_members(board_id,user_id,role) VALUES
 ('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','12121212-1212-4212-8212-121212121212','owner');
INSERT INTO auth.sessions(id,user_id) VALUES
 ('12121212-1212-4212-8212-121212121213','12121212-1212-4212-8212-121212121212');

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);

DO $accept$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='88888888-8888-4888-8888-888888888888';
 wrong_doc uuid:='77777777-7777-4777-8777-777777777777';
 payload jsonb:='{
  "documentType":"quotation",
  "documentNumber":"CP-TL-08E02-RETRY-001",
  "verifiedBy":"Primary reviewer",
  "verifiedByEmail":"primary-reviewer@example.test",
  "approvedBy":"Original secondary reviewer",
  "approvedByEmail":"original-secondary@example.test",
  "currency":"PHP",
  "items":[]
 }'::jsonb;
 substituted jsonb;
 invalid_substitution jsonb;
 changed jsonb;
 receipt jsonb;
 doc_revision bigint;
 event_count integer;
 board_updated_at timestamptz;
 document_updated_at timestamptz;
 board_item_id uuid;
 all_documents jsonb;
BEGIN
 receipt:=public.tl03_document_save(board,doc,0,'create',payload,'for-approval');
 IF receipt->>'operation'<>'create'
  OR (receipt->>'revision')::bigint<>1
  OR receipt->>'state'<>'for-approval'
  OR coalesce((receipt->>'idempotent')::boolean,true)
 THEN RAISE EXCEPTION 'Initial signed document create failed'; END IF;

 receipt:=public.tl03_document_save(board,doc,0,'create',payload,'for-approval');
 IF receipt->>'idempotent'<>'true'
  OR (receipt->>'revision')::bigint<>1
  OR (SELECT count(*) FROM public.tradelink_documents WHERE id=doc)<>1
  OR (SELECT count(*) FROM public.work_board_items
      WHERE board_id=board AND title='CP-TL-08E02-RETRY-001')<>1
  OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc)<>1
 THEN RAISE EXCEPTION 'Idempotent create retry duplicated document, Board item or audit'; END IF;

 SELECT updated_at INTO document_updated_at
 FROM public.tradelink_documents WHERE id=doc;
 receipt:=public.tl03_document_save(board,doc,1,'update',payload,'for-approval');
 IF receipt->>'idempotent'<>'true'
  OR (receipt->>'revision')::bigint<>1
  OR (SELECT revision FROM public.tradelink_documents WHERE id=doc)<>1
  OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc)<>1
  OR (SELECT updated_at FROM public.tradelink_documents WHERE id=doc)<>document_updated_at
 THEN RAISE EXCEPTION 'Exact no-op update changed revision, timestamp or audit'; END IF;

 invalid_substitution:=pg_catalog.jsonb_set(payload,'{approvedByEmail}',
  '"missing-reviewer@example.test"'::jsonb);
 BEGIN
  PERFORM public.tl03_document_save(board,doc,1,'update',
   invalid_substitution,'for-approval');
  RAISE EXCEPTION 'Unknown replacement reviewer was accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 IF (SELECT revision FROM public.tradelink_documents WHERE id=doc)<>1
  OR (SELECT content->>'approvedByEmail' FROM public.tradelink_documents WHERE id=doc)
     <>'original-secondary@example.test'
  OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc)<>1
 THEN RAISE EXCEPTION 'Failed reviewer substitution mutated the authoritative document'; END IF;

 substituted:=pg_catalog.jsonb_set(payload,'{approvedByEmail}',
  '"temporary-reviewer@example.test"'::jsonb);
 substituted:=pg_catalog.jsonb_set(substituted,'{approvedBy}',
  '"Temporary secondary reviewer"'::jsonb);
 receipt:=public.tl03_document_save(board,doc,1,'update',substituted,'for-approval');
 IF receipt->>'operation'<>'update'
  OR (receipt->>'revision')::bigint<>2
  OR coalesce((receipt->>'idempotent')::boolean,true)
 THEN RAISE EXCEPTION 'Revision-bound reviewer substitution did not commit'; END IF;

 SELECT d.board_item_id,d.updated_at,i.updated_at
 INTO board_item_id,document_updated_at,board_updated_at
 FROM public.tradelink_documents d
 JOIN public.work_board_items i ON i.id=d.board_item_id
 WHERE d.id=doc;
 IF board_updated_at IS DISTINCT FROM document_updated_at
  OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
   JOIN public.tradelink_documents d ON d.board_item_id=i.id
   WHERE d.id=doc AND i.title=d.document_number
    AND i.updated_at=d.updated_at AND i.updated_by=d.updated_by)
 THEN RAISE EXCEPTION 'Successful update did not synchronize the authoritative Board projection'; END IF;

 receipt:=public.tl03_document_save(board,doc,1,'update',substituted,'for-approval');
 IF receipt->>'idempotent'<>'true'
  OR (receipt->>'revision')::bigint<>2
  OR (SELECT revision FROM public.tradelink_documents WHERE id=doc)<>2
  OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc)<>2
 THEN RAISE EXCEPTION 'Immediate same-actor update replay was not idempotent'; END IF;

 receipt:=public.tl03_document_save(board,doc,2,'update',substituted,'for-approval');
 IF receipt->>'idempotent'<>'true'
  OR (receipt->>'revision')::bigint<>2
  OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc)<>2
 THEN RAISE EXCEPTION 'Current-revision no-op changed the document or audit'; END IF;

 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
  '12121212-1212-4212-8212-121212121212',true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
  '12121212-1212-4212-8212-121212121213',true);
 BEGIN
  PERFORM public.tl03_document_save(board,doc,1,'update',substituted,'for-approval');
  RAISE EXCEPTION 'Different signed actor replay was accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
  '11111111-1111-4111-8111-111111111111',true);

 changed:=pg_catalog.jsonb_set(substituted,'{remarks}','"newer concurrent edit"'::jsonb);
 BEGIN
  PERFORM public.tl03_document_save(board,doc,1,'update',changed,'for-approval');
  RAISE EXCEPTION 'Stale changed payload was accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_save(board,wrong_doc,1,'update',substituted,'for-approval');
  RAISE EXCEPTION 'Wrong document identifier was accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

 all_documents:=public.tl03_documents_list(board,50);
 IF pg_catalog.jsonb_array_length(all_documents)<>1
  OR all_documents->0->>'documentId'<>doc::text
  OR (all_documents->0->>'revision')::bigint<>2
  OR all_documents->0->>'workflowState'<>'for-approval'
 THEN RAISE EXCEPTION 'All Documents projection did not expose the persisted reviewer substitution'; END IF;

 SELECT revision INTO doc_revision FROM public.tradelink_documents WHERE id=doc;
 SELECT count(*) INTO event_count
 FROM public.tradelink_document_events WHERE document_id=doc;
 IF doc_revision<>2 OR event_count<>2
  OR (SELECT content->>'approvedByEmail' FROM public.tradelink_documents WHERE id=doc)
      <>'temporary-reviewer@example.test'
  OR (SELECT count(*) FROM public.tradelink_document_events
      WHERE document_id=doc AND operation='created')<>1
  OR (SELECT count(*) FROM public.tradelink_document_events
      WHERE document_id=doc AND operation='updated')<>1
  OR (SELECT count(*) FROM public.work_board_events
      WHERE board_id=board AND entity_id=doc::text
       AND event_type IN ('tradelink.document.create','tradelink.document.update'))<>2
  OR (SELECT count(*) FROM public.work_board_items
      WHERE board_id=board AND title='CP-TL-08E02-RETRY-001')<>1
 THEN RAISE EXCEPTION 'Retry-safe final revision, reviewer, Board or audit integrity failed'; END IF;

 RAISE NOTICE 'CP-TL-08E-02 retry-safe create/no-op/substitution/replay/stale-denial/Board/audit PASS';
END $accept$;

RESET ROLE;
ROLLBACK;
