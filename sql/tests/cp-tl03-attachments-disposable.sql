-- TradeLink source-only signed metadata and RLS denial coverage. The signed
-- object creation here simulates the binary Storage API's metadata insert;
-- it does not test actual Supabase Storage uploads/downloads.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);

DO $create_doc$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='90000000-aaaa-4000-8000-000000000001';
 payload jsonb;receipt jsonb;
BEGIN
 payload:='{"documentType":"quotation","documentNumber":"Q-ATTACHMENT-01",
 "customerName":"Synthetic customer","customerEmail":"buyer@example.test",
 "validity":"30 days","deliveryCommitment":"Two weeks","paymentTerms":"Net 30",
 "approvedBy":"Manager","items":[{"id":"line-1","kind":"item",
 "description":"Synthetic item","quantity":1,"unitPrice":200}]}'::jsonb;
 receipt:=public.tl03_document_commit(board,doc,0,'create',payload);
 IF receipt->>'documentId' IS DISTINCT FROM doc::text THEN
  RAISE EXCEPTION 'Synthetic TradeLink document creation failed'; END IF;
 BEGIN
  PERFORM public.tl03_attachment_finish(doc,
   '90000000-0000-4000-8000-000000000002',1,
   pg_catalog.repeat('a',64));
  RAISE EXCEPTION 'Unprepared attachment finalization accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.tl03_attachment_prepare(board,doc,1,'evil.exe',
   'application/pdf',1024,NULL);
  RAISE EXCEPTION 'Dangerous extension accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.tl03_attachment_prepare(board,doc,1,'../unsafe.pdf',
   'application/pdf',1024,NULL);
  RAISE EXCEPTION 'Traversal filename accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.tl03_attachment_prepare(board,doc,1,'file.pdf',
   'image/png',1024,NULL);
  RAISE EXCEPTION 'MIME mismatch accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.tl03_attachment_prepare(board,doc,1,'file.pdf',
   'application/pdf',20971521,NULL);
  RAISE EXCEPTION 'Over-limit file accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 receipt:=public.tl03_attachment_prepare(board,doc,1,
  'synthetic-quotation.pdf','application/pdf',1024,NULL);
 IF receipt->>'expectedRevision'<>'1' OR
  receipt->>'mimeType'<>'application/pdf' OR
  receipt->>'sizeBytes'<>'1024' OR
  receipt->>'attachmentRevision'<>'1' THEN
  RAISE EXCEPTION 'Server-created upload intent incorrect'; END IF;
 PERFORM pg_catalog.set_config('tl03.attachment_id',receipt->>'attachmentId',true);
 PERFORM pg_catalog.set_config('tl03.storage_key',receipt->>'storageKey',true);
 BEGIN
  PERFORM public.tl03_attachment_finish(doc,
   (receipt->>'attachmentId')::uuid,1,pg_catalog.repeat('a',64));
  RAISE EXCEPTION 'Finalization accepted without actual Storage object';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $create_doc$;

-- Before object upload: a pending file is not available through GET.
DO $pending$
BEGIN
 IF (SELECT count(*) FROM storage.objects o
    WHERE o.bucket_id='tradelink-attachments')<>0 THEN
  RAISE EXCEPTION 'No initial binary object should exist'; END IF;
 BEGIN
 INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
 VALUES('tradelink-attachments',
  '00000000-0000-4000-8000-000000000001/'||
  '90000000-aaaa-4000-8000-000000000001/'||
  '90000000-0000-4000-8000-000000000099/forged.pdf',
  auth.uid()::text,'{"size":1024,"mimetype":"application/pdf"}');
 RAISE EXCEPTION 'Arbitrary user-selected object path accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
 VALUES('tradelink-attachments',
  current_setting('tl03.storage_key',true),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '{"size":1024,"mimetype":"application/pdf"}');
 RAISE EXCEPTION 'Forged owner accepted by storage RLS';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $pending$;
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
VALUES('tradelink-attachments',current_setting('tl03.storage_key',true),
 auth.uid()::text,'{"size":1024,"mimetype":"application/pdf"}');
DO $pending_read$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='tradelink-attachments')<>0
 THEN RAISE EXCEPTION 'Pending object visible to authenticated readers'; END IF;
END $pending_read$;

DO $finalize$
DECLARE doc uuid:='90000000-aaaa-4000-8000-000000000001';
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 a uuid:=current_setting('tl03.attachment_id',true)::uuid;
 receipt jsonb;d public.tradelink_documents%rowtype;
BEGIN
 receipt:=public.tl03_attachment_finish(doc,a,1,pg_catalog.repeat('a',64));
 SELECT * INTO d FROM public.tradelink_documents WHERE id=doc;
 IF receipt->>'revision'<>'2' OR receipt->>'state'<>'active'
 OR d.revision<>2 OR
  NOT EXISTS(SELECT 1 FROM public.work_board_items i WHERE i.id=d.board_item_id
   AND i.updated_at=d.updated_at AND i.updated_by=d.updated_by)
 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='tradelink-attachments')<>1
 OR (public.tl03_attachment_list(doc,25))->0->>'attachmentId'<>a::text
 OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=doc AND e.revision=2 AND e.operation='attachment-added'
     AND e.actor_id=auth.uid())
 THEN RAISE EXCEPTION 'File finalize, Board, document, RLS or audit failed'; END IF;
 -- No authenticated Storage UPDATE grant may override an existing object,
 -- even when this signed user can read the active private file.
 UPDATE storage.objects SET metadata='{"size":1,"mimetype":"application/pdf"}'
  WHERE bucket_id='tradelink-attachments';
 IF FOUND THEN RAISE EXCEPTION 'Storage UPDATE/upsert privilege was available'; END IF;
 BEGIN
  PERFORM public.tl03_attachment_finish(doc,a,1,pg_catalog.repeat('a',64));
  RAISE EXCEPTION 'Duplicate finalize accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.tl03_attachment_prepare(board,doc,2,'synthetic-quotation.pdf',
   'application/pdf',1024,NULL);
  RAISE EXCEPTION 'Duplicate active filename accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 receipt:=public.tl03_attachment_prepare(board,doc,2,'synthetic-quotation.pdf',
  'application/pdf',2048,a);
 IF receipt->>'attachmentRevision'<>'2' THEN
  RAISE EXCEPTION 'Replacement revision did not increment'; END IF;
 PERFORM pg_catalog.set_config('tl03.replace_id',receipt->>'attachmentId',true);
 PERFORM pg_catalog.set_config('tl03.replace_key',receipt->>'storageKey',true);
END $finalize$;
INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
VALUES('tradelink-attachments',current_setting('tl03.replace_key',true),
 auth.uid()::text,'{"size":2048,"mimetype":"application/pdf"}');
DO $replace$
DECLARE doc uuid:='90000000-aaaa-4000-8000-000000000001';
 old uuid:=current_setting('tl03.attachment_id',true)::uuid;
 new_id uuid:=current_setting('tl03.replace_id',true)::uuid;
 receipt jsonb;d public.tradelink_documents%rowtype;
BEGIN
 BEGIN
  PERFORM public.tl03_attachment_finish(doc,new_id,2,pg_catalog.repeat('x',64));
  RAISE EXCEPTION 'Non-SHA256 digest accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 receipt:=public.tl03_attachment_finish(doc,new_id,2,pg_catalog.repeat('b',64));
 SELECT * INTO d FROM public.tradelink_documents WHERE id=doc;
 IF receipt->>'revision'<>'3' OR d.revision<>3 OR
  pg_catalog.jsonb_array_length(public.tl03_attachment_list(doc,25))<>1 OR
  (SELECT count(*) FROM storage.objects WHERE bucket_id='tradelink-attachments')<>1
 THEN RAISE EXCEPTION 'Replaced object still readable or active metadata duplicated'; END IF;
 BEGIN
  PERFORM public.tl03_attachment_remove(doc,old,3,
   'Old replaced file not currently active');
  RAISE EXCEPTION 'Replaced old attachment removed again';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.tl03_attachment_remove(doc,new_id,3,'No');
  RAISE EXCEPTION 'Removal without proper reason accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 receipt:=public.tl03_attachment_remove(doc,new_id,3,'Document attachment replaced by corrected version');
 IF receipt->>'revision'<>'4' OR receipt->>'state'<>'removed' OR
  (SELECT count(*) FROM storage.objects WHERE bucket_id='tradelink-attachments')<>0
 OR pg_catalog.jsonb_array_length(public.tl03_attachment_list(doc,25))<>0
 OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=doc AND e.revision=4 AND e.operation='attachment-removed'
     AND e.metadata->>'reason'='Document attachment replaced by corrected version')
 THEN RAISE EXCEPTION 'Logical removal, RLS and append-only event failed'; END IF;
 -- Physical objects are retained: restricted RLS prevents reads after logical removal.
END $replace$;

-- Synthetic unauthorized user is Board owner, but NOT TradeLink GM.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '22222222-2222-4222-8222-222222222222',true);
DO $role_denied$
DECLARE doc uuid:='90000000-aaaa-4000-8000-000000000001';
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
BEGIN
 BEGIN
  PERFORM public.tl03_attachment_prepare(board,doc,4,'user.pdf','application/pdf',100,NULL);
  RAISE EXCEPTION 'Board owner with non-GM role was allowed to attach';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tl03_attachment_list(doc,25);
  RAISE EXCEPTION 'Board owner with non-GM role was allowed to list files';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='tradelink-attachments')<>0
 THEN RAISE EXCEPTION 'Board-only user read TradeLink private object'; END IF;
END $role_denied$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '44444444-4444-4444-8444-444444444444',true);
DO $workspace_denied$
BEGIN
 BEGIN
  PERFORM public.tl03_attachment_list('90000000-aaaa-4000-8000-000000000001',25);
  RAISE EXCEPTION 'Foreign workspace read document files';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='tradelink-attachments')<>0
 THEN RAISE EXCEPTION 'Foreign workspace read private objects'; END IF;
END $workspace_denied$;
-- Signed identity with no matching active auth.sessions row is always denied,
-- including object GET, metadata RPC, and Storage insertion.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '99999999-9999-4999-8999-999999999999',true);
DO $revoked_denied$
DECLARE doc uuid:='90000000-aaaa-4000-8000-000000000001';
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
BEGIN
 BEGIN
  PERFORM public.tl03_attachment_prepare(board,doc,4,
   'revoked.pdf','application/pdf',100,NULL);
  RAISE EXCEPTION 'Revoked signed session prepared an attachment';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tl03_attachment_list(doc,25);
  RAISE EXCEPTION 'Revoked signed session listed private attachments';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM storage.objects
  WHERE bucket_id='tradelink-attachments')<>0
 THEN RAISE EXCEPTION 'Revoked session accessed private file'; END IF;
END $revoked_denied$;
RESET ROLE;
ROLLBACK;
