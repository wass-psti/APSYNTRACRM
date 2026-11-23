-- Runs ONLY in a disposable PostgreSQL database. Never run against production.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);

DO $create$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc_id uuid;
 payload jsonb;
 receipt jsonb;
 i integer;
BEGIN
 FOR i IN 1..3 LOOP
  doc_id:=('00000000-0000-4000-8000-'||pg_catalog.lpad((100+i)::text,12,'0'))::uuid;
  payload:=pg_catalog.jsonb_build_object(
   'documentType','quotation','documentNumber','Q-BULK-'||i,
   'customerName','Bulk Client '||i,'date','2026-11-23',
   'currency','PHP','vatType','12',
   'verifiedBy','QA Reviewer One','verifiedByEmail','qa-reviewer-one@example.test',
   'approvedBy','QA Reviewer Two','approvedByEmail','qa-reviewer-two@example.test',
   'remarks','Disposable bulk-action test document',
   'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id','line-one','kind','item','description','Bulk test line','quantity',1,'unitPrice',10))
  );
  receipt:=public.tl03_document_save(board,doc_id,0,'create',payload,'for-approval');
  IF receipt->>'documentId'<>doc_id::text OR receipt->>'revision'<>'1'
   OR receipt->>'state'<>'for-approval' THEN
   RAISE EXCEPTION 'Bulk-action fixture create receipt mismatch: %',receipt;
  END IF;
 END LOOP;
END $create$;

DO $stale_batch$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
BEGIN
 BEGIN
  PERFORM public.tl03_documents_bulk_action(board,'hide',pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('id','00000000-0000-4000-8000-000000000101','revision',1),
   pg_catalog.jsonb_build_object('id','00000000-0000-4000-8000-000000000103','revision',99)
  ));
  RAISE EXCEPTION 'Stale selected revision unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM public.tradelink_documents
  WHERE id IN ('00000000-0000-4000-8000-000000000101',
               '00000000-0000-4000-8000-000000000103') AND hidden_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Stale batch partially changed document visibility';
 END IF;
END $stale_batch$;

DO $hide$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 receipt jsonb;
 before_rows jsonb;
 hidden_page jsonb;
 visible_page jsonb;
 doc public.tradelink_documents%rowtype;
BEGIN
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'id',id,'revision',revision,'updatedAt',updated_at) ORDER BY id),'[]'::jsonb)
 INTO before_rows FROM public.tradelink_documents
 WHERE id IN ('00000000-0000-4000-8000-000000000101',
              '00000000-0000-4000-8000-000000000102');
 receipt:=public.tl03_documents_bulk_action(board,'hide',pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object('id','00000000-0000-4000-8000-000000000101','revision',1),
  pg_catalog.jsonb_build_object('id','00000000-0000-4000-8000-000000000102','revision',1)
 ));
 IF receipt->>'applied'<>'2' OR receipt->>'action'<>'hide'
  OR pg_catalog.jsonb_array_length(receipt->'documents')<>2 THEN
  RAISE EXCEPTION 'Hide bulk receipt mismatch: %',receipt; END IF;
 hidden_page:=public.tl03_documents_page(board,'','all','all','all','hidden',NULL,NULL,50);
 visible_page:=public.tl03_documents_page(board,'','all','all','all','visible',NULL,NULL,50);
 IF pg_catalog.jsonb_array_length(hidden_page->'rows')<>2
  OR pg_catalog.jsonb_array_length(visible_page->'rows')<>1
  OR (hidden_page->'rows'->0->>'hidden')<>'true'
  OR (visible_page->'rows'->0->>'documentId')<>'00000000-0000-4000-8000-000000000103' THEN
  RAISE EXCEPTION 'Visible/hidden list reconciliation failed: hidden %, visible %',hidden_page,visible_page;
 END IF;
 FOR doc IN SELECT * FROM public.tradelink_documents
  WHERE id IN ('00000000-0000-4000-8000-000000000101',
               '00000000-0000-4000-8000-000000000102') LOOP
  IF doc.hidden_at IS NULL OR doc.hidden_by<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
   OR doc.deleted_at IS NOT NULL OR doc.revision<>1
   OR doc.updated_at IS DISTINCT FROM (before_rows->(CASE WHEN doc.id='00000000-0000-4000-8000-000000000101'::uuid THEN 0 ELSE 1 END)->>'updatedAt')::timestamptz
   OR (SELECT archived_at FROM public.work_board_items WHERE id=doc.board_item_id) IS NOT NULL THEN
   RAISE EXCEPTION 'Hide changed document content, revision, timestamp or Board projection: %',doc.id;
  END IF;
 END LOOP;
 RAISE NOTICE 'CP-TL bulk hide PASS: exact selected IDs, persistent hidden state, no revision or Board lifecycle change';
END $hide$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','22222222-2222-4222-8222-222222222222',true);
DO $reviewer_hidden$
DECLARE page jsonb;
BEGIN
 page:=public.tl03_documents_page(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','', 'all','all','all','all',NULL,NULL,50);
 IF pg_catalog.jsonb_array_length(page->'rows')<>1
  OR page->'rows'->0->>'documentId'<>'00000000-0000-4000-8000-000000000103' THEN
  RAISE EXCEPTION 'Hidden documents leaked into the non-manager All Documents page: %',page; END IF;
 RAISE NOTICE 'CP-TL bulk hide reviewer visibility PASS: hidden documents stay out of the normal All Documents page';
END $reviewer_hidden$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);

DO $unhide$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 receipt jsonb;
 visible_page jsonb;
BEGIN
 receipt:=public.tl03_documents_bulk_action(board,'unhide',pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object('id','00000000-0000-4000-8000-000000000101','revision',1)
 ));
 IF receipt->>'applied'<>'1' OR receipt->'documents'->0->>'hidden'<>'false' THEN
  RAISE EXCEPTION 'Unhide receipt mismatch: %',receipt; END IF;
 visible_page:=public.tl03_documents_page(board,'','all','all','all','visible',NULL,NULL,50);
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(visible_page->'rows') r
  WHERE r->>'documentId'='00000000-0000-4000-8000-000000000101')
  OR (SELECT hidden_at FROM public.tradelink_documents
   WHERE id='00000000-0000-4000-8000-000000000101') IS NOT NULL THEN
  RAISE EXCEPTION 'Unhide did not restore the original document'; END IF;
 RAISE NOTICE 'CP-TL bulk unhide PASS: restored original document ID and content';
END $unhide$;

RESET ROLE;

DO $delete$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 receipt jsonb;
 doc public.tradelink_documents%rowtype;
 board_archived timestamptz;
 visible_page jsonb;
 hidden_page jsonb;
BEGIN
 SELECT * INTO doc FROM public.tradelink_documents
  WHERE id='00000000-0000-4000-8000-000000000102';
 receipt:=public.tl03_documents_bulk_action(board,'delete',pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object('id',doc.id,'revision',doc.revision)
 ));
 SELECT * INTO doc FROM public.tradelink_documents WHERE id=doc.id;
 SELECT archived_at INTO board_archived FROM public.work_board_items WHERE id=doc.board_item_id;
 visible_page:=public.tl03_documents_page(board,'','all','all','all','visible',NULL,NULL,50);
 hidden_page:=public.tl03_documents_page(board,'','all','all','all','hidden',NULL,NULL,50);
 IF receipt->>'applied'<>'1' OR receipt->'documents'->0->>'deleted'<>'true'
  OR doc.deleted_at IS NULL OR doc.deleted_by<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
  OR doc.hidden_at IS NOT NULL OR doc.revision<>1 OR board_archived IS NULL
  OR public.tl03_document_read(board,doc.id) IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(visible_page->'rows') r
    WHERE r->>'documentId'=doc.id::text)
  OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(hidden_page->'rows') r
    WHERE r->>'documentId'=doc.id::text)
  OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc.id)<>1
  OR (SELECT count(*) FROM private.tradelink_document_revision_snapshots WHERE document_id=doc.id)<>1
 THEN RAISE EXCEPTION 'Delete tombstone, Board projection or immutable history reconciliation failed'; END IF;
 BEGIN
  UPDATE public.tradelink_documents SET workflow_state='cancelled' WHERE id=doc.id;
  RAISE EXCEPTION 'Terminal deleted document unexpectedly accepted a later update';
 EXCEPTION WHEN SQLSTATE 'PT410' THEN NULL;
 END;
 IF NOT EXISTS(SELECT 1 FROM public.work_board_events
  WHERE board_id=board AND event_type='tradelink.documents.bulk_delete') THEN
  RAISE EXCEPTION 'Bulk delete audit log entry missing'; END IF;
 RAISE NOTICE 'CP-TL bulk delete PASS: terminal tombstone, Board projection archived, audit/revision history retained';
END $delete$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','22222222-2222-4222-8222-222222222222',true);
DO $reviewer_deleted$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 assigned jsonb;
BEGIN
 assigned:=public.tl03_assigned_documents(board,50);
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(assigned) r
  WHERE r->>'documentId'='00000000-0000-4000-8000-000000000102') THEN
  RAISE EXCEPTION 'Deleted document remained in the reviewer inbox'; END IF;
 BEGIN
  PERFORM public.tl03_document_read_assigned(board,
   '00000000-0000-4000-8000-000000000102');
  RAISE EXCEPTION 'Deleted document unexpectedly opened through assigned read';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 BEGIN
  PERFORM public.tl03_record_review_stage(board,
   '00000000-0000-4000-8000-000000000102',1,'primary');
  RAISE EXCEPTION 'Deleted document unexpectedly accepted a new review stage';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 RAISE NOTICE 'CP-TL bulk delete reviewer reconciliation PASS: hidden from inbox, stale reads denied, review writes rejected';
END $reviewer_deleted$;
RESET ROLE;
DO $reviewer_no_new_review$
BEGIN
 BEGIN
  INSERT INTO private.tradelink_document_reviews(
   document_id,board_id,workspace_id,document_revision,stage,assigned_email,actor_id
  ) VALUES(
   '00000000-0000-4000-8000-000000000102',
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '00000000-0000-4000-8000-000000000001',1,'primary',
   'qa-reviewer-one@example.test','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );
  RAISE EXCEPTION 'Deleted document unexpectedly accepted a review insert';
 EXCEPTION WHEN SQLSTATE 'PT410' THEN NULL;
 END;
 IF (SELECT count(*) FROM private.tradelink_document_reviews
  WHERE document_id='00000000-0000-4000-8000-000000000102')<>0 THEN
  RAISE EXCEPTION 'Deleted document received a new reviewer event'; END IF;
END $reviewer_no_new_review$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);

DO $selection$
DECLARE visible_page jsonb;
 list_rows jsonb;
BEGIN
 visible_page:=public.tl03_documents_page(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','', 'all','all','all','visible',NULL,NULL,50);
 list_rows:=public.tl03_documents_list('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',50);
 IF pg_catalog.jsonb_array_length(visible_page->'rows')<>2
  OR pg_catalog.jsonb_array_length(list_rows)<>2
  OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(visible_page->'rows') r
   WHERE r->>'documentId'='00000000-0000-4000-8000-000000000103'
    AND r->>'hidden'<>'false') THEN
  RAISE EXCEPTION 'Bulk actions affected an unselected record or compatibility list'; END IF;
 RAISE NOTICE 'CP-TL bulk selection isolation PASS: unselected document remains visible; deleted/hidden records excluded';
END $selection$;

RESET ROLE;
ROLLBACK;
