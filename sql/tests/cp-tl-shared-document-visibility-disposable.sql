\set ON_ERROR_STOP on
BEGIN;

-- Create one document as an ordinary TradeLink User and another as a
-- General Manager. All records are disposable and rolled back at the end.
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '22222222-2222-4222-8222-222222222222',true);

DO $create$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 user_document uuid:='d1111111-1111-4111-8111-111111111111';
 manager_document uuid:='d2222222-2222-4222-8222-222222222222';
 payload jsonb:=pg_catalog.jsonb_build_object(
  'documentType','quotation','documentNumber','','date','2026-11-26',
  'vendorId','watchdog-sales','templateId','watchdog-sales-reference-v1',
  'customerName','Shared Visibility User QA','customerEmail','user@example.test',
  'validity','30 days','deliveryCommitment','Within 14 days',
  'paymentTerms','Net 30','approvedBy','Management',
  'verifiedByEmail','aacsenagan@watchdogautomation.com.ph',
  'approvedByEmail','asenagan@watchdogautomation.com.ph',
  'quoteStatus','Working on it','currency','PHP','terms','Shared visibility QA',
  'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'id','shared-visibility-user-line','kind','item',
   'description','User-created shared visibility test','quantity',1,'unitPrice',10)));
 manager_payload jsonb:=payload||pg_catalog.jsonb_build_object(
  'customerName','Shared Visibility Manager QA',
  'customerEmail','manager@example.test');
 user_receipt jsonb;
 manager_receipt jsonb;
 listing jsonb;
 page jsonb;
 saved jsonb;
 bundle jsonb;
 direct_count integer;
BEGIN
 IF private.tl03_can_view_documents(board) IS DISTINCT FROM TRUE
  OR private.tl03_can_manage(board) IS DISTINCT FROM FALSE
  OR private.tl03_can_create_draft(board) IS DISTINCT FROM TRUE
 THEN
  RAISE EXCEPTION 'Ordinary User read/create capability fixture is invalid';
 END IF;

 user_receipt:=public.tl03_document_create(board,user_document,payload,'draft');
 IF user_receipt->>'documentId'<>user_document::text
  OR user_receipt->>'operation'<>'create'
  OR user_receipt->>'revision'<>'1'
 THEN RAISE EXCEPTION 'Ordinary User test document creation failed: %',user_receipt; END IF;

 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
  '11111111-1111-4111-8111-111111111111',true);
 IF private.tl03_can_view_documents(board) IS DISTINCT FROM TRUE
  OR private.tl03_can_manage(board) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'General Manager read/manage capability fixture is invalid'; END IF;

 manager_receipt:=public.tl03_document_create(
  board,manager_document,manager_payload,'draft');
 IF manager_receipt->>'documentId'<>manager_document::text
  OR manager_receipt->>'operation'<>'create'
  OR manager_receipt->>'revision'<>'1'
 THEN RAISE EXCEPTION 'General Manager test document creation failed: %',manager_receipt; END IF;

 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
  '22222222-2222-4222-8222-222222222222',true);

 listing:=public.tl03_documents_list(board,100);
 page:=public.tl03_documents_page(board,'','all','all','active','visible',NULL,NULL,50);
 SELECT count(*) INTO direct_count
 FROM public.tradelink_documents d WHERE d.board_id=board;

 IF pg_catalog.jsonb_array_length(listing)<>2
  OR pg_catalog.jsonb_array_length(page->'rows')<>2
  OR direct_count<>2
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(listing) r
    WHERE r->>'documentId'=manager_document::text
     AND r->>'createdByActor'='false')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(listing) r
    WHERE r->>'documentId'=user_document::text
     AND r->>'createdByActor'='true')
 THEN
  RAISE EXCEPTION 'Ordinary User did not receive the complete cross-creator list/page and RLS rows: list %, page %, direct %',
   listing,page,direct_count;
 END IF;

 saved:=public.tl03_document_read(board,manager_document);
 IF saved->>'id'<>manager_document::text
  OR saved->>'created_by'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  OR coalesce(saved->>'created_by_name','')=''
 THEN RAISE EXCEPTION 'Ordinary User could not read another creator document and creator identity: %',saved; END IF;

 bundle:=public.tl03_document_revision_bundle(board,manager_document,NULL);
 IF bundle->>'documentId'<>manager_document::text
  OR bundle->>'currentRevision'<>'1'
  OR bundle->'selected'->>'created_by'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 THEN RAISE EXCEPTION 'Ordinary User could not read another creator revision bundle: %',bundle; END IF;

 BEGIN
  PERFORM public.tl03_documents_bulk_action(board,'hide',
   pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id',manager_document,'revision',1)));
  RAISE EXCEPTION 'Ordinary User unexpectedly performed Hide Selected';
 EXCEPTION WHEN insufficient_privilege THEN
  NULL;
 END;

 IF EXISTS(SELECT 1 FROM public.tradelink_documents
   WHERE id=manager_document AND hidden_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Denied User bulk action changed the manager document'; END IF;
END;
$create$;

-- Exercise archived and hidden filters as the same ordinary User. The user
-- can inspect the same visibility states as a manager without gaining bulk
-- mutation capability.
RESET ROLE;
UPDATE public.tradelink_documents
 SET hidden_at=pg_catalog.now(),hidden_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 WHERE id='d1111111-1111-4111-8111-111111111111';
UPDATE public.tradelink_documents
 SET archived_at=pg_catalog.now()
 WHERE id='d2222222-2222-4222-8222-222222222222';

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '22222222-2222-4222-8222-222222222222',true);

DO $filters$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 all_rows jsonb;
 hidden_rows jsonb;
 visible_rows jsonb;
 listing jsonb;
 hidden_read jsonb;
BEGIN
 all_rows:=public.tl03_documents_page(board,'','all','all','all','all',NULL,NULL,50);
 hidden_rows:=public.tl03_documents_page(board,'','all','all','all','hidden',NULL,NULL,50);
 visible_rows:=public.tl03_documents_page(board,'','all','all','all','visible',NULL,NULL,50);
 listing:=public.tl03_documents_list(board,100);
 hidden_read:=public.tl03_document_read(board,'d1111111-1111-4111-8111-111111111111');

 IF pg_catalog.jsonb_array_length(all_rows->'rows')<>2
  OR pg_catalog.jsonb_array_length(hidden_rows->'rows')<>1
  OR hidden_rows->'rows'->0->>'documentId'<>'d1111111-1111-4111-8111-111111111111'
  OR pg_catalog.jsonb_array_length(visible_rows->'rows')<>1
  OR visible_rows->'rows'->0->>'documentId'<>'d2222222-2222-4222-8222-222222222222'
  OR pg_catalog.jsonb_array_length(listing)<>1
  OR hidden_read->>'id'<>'d1111111-1111-4111-8111-111111111111'
 THEN RAISE EXCEPTION 'Ordinary User archive/visibility filters or hidden document read failed: all %, hidden %, visible %, list %',
  all_rows,hidden_rows,visible_rows,listing; END IF;
END;
$filters$;

-- A General Manager still sees the shared collection and retains the existing
-- manager capability. A manager-only mutation RPC is not redefined here.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);
DO $manager$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 page jsonb;
BEGIN
 IF private.tl03_can_view_documents(board) IS DISTINCT FROM TRUE
  OR private.tl03_can_manage(board) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'General Manager lost existing TradeLink access'; END IF;
 page:=public.tl03_documents_page(board,'','all','all','all','all',NULL,NULL,50);
 IF pg_catalog.jsonb_array_length(page->'rows')<>2
 THEN RAISE EXCEPTION 'General Manager shared document list regressed: %',page; END IF;
END;
$manager$;

-- A user assigned TradeLink in another workspace must not read this board.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '44444444-4444-4444-8444-444444444444',true);
DO $workspace$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
BEGIN
 IF private.tl03_can_view_documents(board) IS DISTINCT FROM FALSE
 THEN RAISE EXCEPTION 'TradeLink shared read escaped the current workspace'; END IF;
 BEGIN
  PERFORM public.tl03_documents_page(board,'','all','all','all','all',NULL,NULL,50);
  RAISE EXCEPTION 'Foreign workspace user unexpectedly read TradeLink documents';
 EXCEPTION WHEN insufficient_privilege THEN
  NULL;
 END;
END;
$workspace$;

ROLLBACK;
