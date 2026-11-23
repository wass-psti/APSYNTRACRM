-- Runs ONLY against synthetic PostgreSQL 17 CI; no production connections.
\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);
DO $accept$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 id1 uuid:='11111111-aaaa-4111-8111-111111111111';
 id2 uuid:='22222222-aaaa-4222-8222-222222222222';
 id3 uuid:='33333333-aaaa-4333-8333-333333333333';
 first_page jsonb; second_page jsonb; searched jsonb; archived jsonb;
 base jsonb:='{"documentType":"quotation","documentNumber":"Q-PAGE-001","items":[{"id":"i","kind":"item","description":"Disposable","quantity":1,"unitPrice":5}]}'::jsonb;
BEGIN
 PERFORM public.tl03_document_commit(board,id1,0,'create',base);
 PERFORM public.tl03_document_commit(board,id2,0,'create',
  jsonb_set(base,'{documentNumber}','"Q-PAGE-002"'::jsonb));
 PERFORM public.tl03_document_commit(board,id3,0,'create',
  jsonb_set(jsonb_set(base,'{documentType}','"packing"'::jsonb),
   '{documentNumber}','"PL-PAGE-003"'::jsonb));
 PERFORM public.tl03_document_commit(board,id1,1,'archive');
 first_page:=public.tl03_documents_page(board,'','all','all','all',NULL,NULL,2);
 IF jsonb_array_length(first_page->'rows')<>2
  OR first_page->>'hasMore'<>'true'
  OR first_page->'nextCursor' IS NULL
  OR first_page->'nextCursor'='null'::jsonb THEN
  RAISE EXCEPTION 'Server page did not return two rows, hasMore, cursor'; END IF;
 second_page:=public.tl03_documents_page(board,'','all','all','all',
  (first_page->'nextCursor'->>'updatedAt')::timestamptz,
  (first_page->'nextCursor'->>'documentId')::uuid,2);
 IF jsonb_array_length(second_page->'rows')<>1
  OR second_page->>'hasMore'<>'false'
  OR second_page->'nextCursor'<>'null'::jsonb
  OR (first_page->'rows'->0->>'documentId') =
   (second_page->'rows'->0->>'documentId') THEN
  RAISE EXCEPTION 'Keyset navigation repeated or skipped records'; END IF;
 searched:=public.tl03_documents_page(board,'page-002','quotation','draft',
  'active',NULL,NULL,50);
 IF jsonb_array_length(searched->'rows')<>1
  OR searched->'rows'->0->>'documentId'<>id2::text THEN
  RAISE EXCEPTION 'Case-insensitive server search / type / active filters failed'; END IF;
 archived:=public.tl03_documents_page(board,'','quotation','draft',
  'archived',NULL,NULL,50);
 IF jsonb_array_length(archived->'rows')<>1
  OR archived->'rows'->0->>'documentId'<>id1::text
  OR archived->'rows'->0->>'archived'<>'true' THEN
  RAISE EXCEPTION 'Archived server filter leaked active record'; END IF;
 BEGIN
  PERFORM public.tl03_documents_page(board,'','all','all','active',NULL,NULL,0);
  RAISE EXCEPTION 'Invalid page limit allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.tl03_documents_page(board,'','all','all','active',now(),NULL,50);
  RAISE EXCEPTION 'Partial keyset cursor allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.tl03_documents_page(board,repeat('x',121),'all','all','active',NULL,NULL,50);
  RAISE EXCEPTION 'Oversized search allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 RAISE NOTICE 'TradeLink signed server search, all/archived filters, keyset and invalid-parameter denial PASS';
END $accept$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','22222222-2222-4222-8222-222222222222',true);
DO $denied$
BEGIN
 BEGIN
  PERFORM public.tl03_documents_page(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','', 'all','all','all',NULL,NULL,50);
  RAISE EXCEPTION 'Unauthorized manager role was allowed to page documents';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','44444444-4444-4444-8444-444444444444',true);
DO $foreign$
BEGIN
 BEGIN
  PERFORM public.tl03_documents_page(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','', 'all','all','all',NULL,NULL,50);
  RAISE EXCEPTION 'Foreign workspace accessed TradeLink document search';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign$;
RESET ROLE;
ROLLBACK;
-- The rollback preserves the original empty synthetic fixture for existing tests.
