-- CP-TL-CREATE-NEW-02: existing TradeLink User, Board Viewer only.
-- Disposable PostgreSQL 17 only. All created rows and sequence increments roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '22222222-2222-4222-8222-222222222222',true);

DO $accept$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 actor uuid:=auth.uid();
 types text[]:=ARRAY['esi','quotation','packing','delivery','payment','po'];
 prefixes text[]:=ARRAY['ESI-','Q-','PL-','DR-','AR-','PO-'];
 ids uuid[]:=ARRAY[
  pg_catalog.gen_random_uuid(),pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),pg_catalog.gen_random_uuid()
 ];
 payloads jsonb[]:=ARRAY[
  pg_catalog.jsonb_build_object(
   'documentType','esi','documentNumber','','date','2026-11-19',
   'vendorId','watchdog-sales','templateId','watchdog-sales-reference-v1',
   'customerName','CP02 ESI QA','customerTin','CP02-TIN-ESI',
   'verifiedBy','msenagan@watchdogautomation.com.ph',
   'approvedBy','asenagan@watchdogautomation.com.ph',
   'currency','PHP','terms','CP02 ESI terms','remarks','Initial ESI',
   'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id','cp02-esi-line','kind','item','description','CP02 ESI item',
    'quantity',1,'unitPrice',10))),
  pg_catalog.jsonb_build_object(
   'documentType','quotation','documentNumber','','date','2026-11-19',
   'vendorId','watchdog-sales','templateId','watchdog-sales-reference-v1',
   'customerName','CP02 Quotation QA','customerEmail','buyer@example.test',
   'validity','30 days','deliveryCommitment','Within 14 days',
   'paymentTerms','Net 30','approvedBy','Management',
   'verifiedByEmail','aacsenagan@watchdogautomation.com.ph',
   'approvedByEmail','asenagan@watchdogautomation.com.ph',
   'quoteStatus','Working on it','currency','PHP','terms','CP02 Quotation terms',
   'remarks','Initial Quotation',
   'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id','cp02-quotation-line','kind','item','description','CP02 quotation item',
    'quantity',1,'unitPrice',20))),
  pg_catalog.jsonb_build_object(
   'documentType','packing','documentNumber','','date','2026-11-19',
   'vendorId','watchdog-sales','templateId','watchdog-sales-reference-v1',
   'customerName','CP02 Packing QA','referenceNumber','CP02-SO-PL',
   'verifiedBy','msenagan@watchdogautomation.com.ph',
   'approvedBy','asenagan@watchdogautomation.com.ph',
   'terms','CP02 Packing terms','remarks','Initial Packing',
   'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id','cp02-packing-line','kind','item','description','CP02 packed goods',
    'quantity',1,'unitPrice',0,'unit','box'))),
  pg_catalog.jsonb_build_object(
   'documentType','delivery','documentNumber','','date','2026-11-19',
   'vendorId','watchdog-sales','templateId','watchdog-sales-reference-v1',
   'customerName','CP02 Delivery QA','referenceNumber','CP02-SO-DR',
   'checkedBy','dsenagan@watchdogautomation.com.ph',
   'deliveredBy','rogang@watchdogautomation.com.ph',
   'terms','CP02 Delivery terms','remarks','Initial Delivery',
   'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id','cp02-delivery-line','kind','item','description','CP02 delivered goods',
    'quantity',1,'unitPrice',0,'unit','pc','serialNumber','CP02-SERIAL-001'))),
  pg_catalog.jsonb_build_object(
   'documentType','payment','documentNumber','','date','2026-11-19',
   'vendorId','watchdog-sales','templateId','watchdog-sales-reference-v1',
   'customerName','CP02 Payment QA','paymentParticulars','CP02 test receipt',
   'receivedBy','msenagan@watchdogautomation.com.ph',
   'verifiedBy','asenagan@watchdogautomation.com.ph',
   'cashAmount',25,'chequeAmount',0,'terms','CP02 Payment terms',
   'remarks','Initial Payment'),
  pg_catalog.jsonb_build_object(
   'documentType','po','documentNumber','','date','2026-11-19',
   'vendorId','watchdog-sales','templateId','watchdog-sales-reference-v1',
   'customerName','CP02 Supplier QA','targetDeliveryDate','2026-12-01',
   'paymentTerms','Net 30','verifiedBy','ppajulas@watchdogautomation.com.ph',
   'approvedBy','asenagan@watchdogautomation.com.ph',
   'currency','PHP','terms','CP02 PO terms','remarks','Initial PO',
   'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id','cp02-po-line','kind','item','description','CP02 supplier materials',
    'quantity',1,'unitPrice',30)))
 ];
 payload jsonb; revised jsonb; stale jsonb; receipt jsonb; saved jsonb;
 listing jsonb; page jsonb; projection jsonb; bundle jsonb;
 doc_id uuid; board_item uuid; doc_number text;
 matches integer; idx integer; expected_prefix text;
 doc_count integer; board_item_count integer;
BEGIN
 IF actor IS DISTINCT FROM 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid
  OR private.tl03_can_create_draft(board) IS DISTINCT FROM TRUE
  OR public.work_board_access(board,'edit') IS DISTINCT FROM FALSE
  OR public.work_board_access(board,'manage') IS DISTINCT FROM FALSE
 THEN RAISE EXCEPTION 'Fixture is not a TradeLink User with domain Create New and Board Viewer only'; END IF;

 FOR idx IN 1..6 LOOP
  doc_id:=ids[idx];
  payload:=payloads[idx];
  expected_prefix:=prefixes[idx];

  receipt:=public.tl03_document_create(board,doc_id,payload,'draft');
  doc_number:=receipt->>'documentNumber';
  IF receipt->>'documentId'<>doc_id::text
   OR receipt->>'revision'<>'1'
   OR receipt->>'state'<>'draft'
   OR receipt->>'operation'<>'create'
   OR receipt->>'idempotent'<>'false'
   OR doc_number IS NULL
   OR doc_number !~ ('^'||expected_prefix||'[0-9]{6,}$')
  THEN RAISE EXCEPTION 'Automatic create receipt mismatch for %: %',types[idx],receipt; END IF;
  board_item:=(receipt->>'boardItemId')::uuid;

  saved:=public.tl03_document_read(board,doc_id);
  IF saved->>'document_number'<>doc_number
   OR saved->'content'->>'documentNumber'<>doc_number
   OR saved->>'document_type'<>types[idx]
   OR saved->>'workflow_state'<>'draft'
   OR saved->>'revision'<>'1'
   OR saved->>'created_by'<>actor::text
   OR saved->>'board_item_id'<>board_item::text
  THEN RAISE EXCEPTION 'Creator-owned persisted readback mismatch for %',types[idx]; END IF;

  projection:=public.tl03_board_projection(doc_id);
  IF projection->'board'->>'id'<>board::text
   OR projection->'board'->>'workspace_id'<>'00000000-0000-4000-8000-000000000001'
   OR projection->'item'->>'id'<>board_item::text
   OR projection->'item'->>'title'<>doc_number
   OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
     WHERE i.id=board_item AND i.board_id=board
      AND i.title=doc_number AND i.status='not_started'
      AND i.position>=0 AND i.created_by=actor)
  THEN RAISE EXCEPTION 'Board projection mismatch for %: %',types[idx],projection; END IF;

  bundle:=public.tl03_document_revision_bundle(board,doc_id,NULL);
  IF bundle->>'documentId'<>doc_id::text
   OR bundle->>'currentRevision'<>'1'
   OR bundle->'selected'->>'document_number'<>doc_number
   OR bundle->'selected'->>'workflow_state'<>'draft'
  THEN RAISE EXCEPTION 'Creator revision readback mismatch for %',types[idx]; END IF;

  receipt:=public.tl03_document_create(board,doc_id,payload,'draft');
  IF receipt->>'idempotent'<>'true'
   OR receipt->>'documentNumber'<>doc_number
   OR receipt->>'boardItemId'<>board_item::text
   OR (SELECT count(*) FROM public.work_board_items i
       WHERE i.id=board_item AND i.board_id=board)<>1
  THEN RAISE EXCEPTION 'Idempotent create replay mismatch for %',types[idx]; END IF;

  revised:=payload||pg_catalog.jsonb_build_object(
   'documentNumber',doc_number,'remarks','CP02 revision two · '||types[idx]);
  receipt:=public.tl03_document_save(board,doc_id,1,'update',revised,'draft');
  IF receipt->>'documentId'<>doc_id::text
   OR receipt->>'boardItemId'<>board_item::text
   OR receipt->>'revision'<>'2'
   OR receipt->>'state'<>'draft'
   OR receipt->>'operation'<>'update'
   OR receipt->>'idempotent'<>'false'
  THEN RAISE EXCEPTION 'Creator Draft update receipt mismatch for %: %',types[idx],receipt; END IF;

  saved:=public.tl03_document_read(board,doc_id);
  projection:=public.tl03_board_projection(doc_id);
  IF saved->>'revision'<>'2'
   OR saved->>'workflow_state'<>'draft'
   OR saved->'content' IS DISTINCT FROM revised
   OR saved->>'document_number'<>doc_number
   OR saved->>'board_item_id'<>board_item::text
   OR projection->'item'->>'title'<>doc_number
   OR projection->'item'->>'updated_at'<>saved->>'updated_at'
  THEN RAISE EXCEPTION 'Revision-two document/Board persistence mismatch for %',types[idx]; END IF;

  receipt:=public.tl03_document_save(board,doc_id,1,'update',revised,'draft');
  bundle:=public.tl03_document_revision_bundle(board,doc_id,NULL);
  IF receipt->>'idempotent'<>'true' OR receipt->>'revision'<>'2'
   OR bundle->>'currentRevision'<>'2'
   OR pg_catalog.jsonb_array_length(bundle->'revisions')<>2
  THEN RAISE EXCEPTION 'Idempotent update replay mismatch for %: receipt %, revision bundle %',
   types[idx],receipt,bundle; END IF;

  stale:=pg_catalog.jsonb_set(revised,'{remarks}',
   pg_catalog.to_jsonb('CP02 stale competing payload · '||types[idx]));
  BEGIN
   PERFORM public.tl03_document_save(board,doc_id,1,'update',stale,'draft');
   RAISE EXCEPTION 'Stale changed update was accepted for %',types[idx];
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
 END LOOP;

 listing:=public.tl03_documents_list(board,100);
 page:=public.tl03_documents_page(board,'','all','all','active',NULL,NULL,50);
 FOR idx IN 1..6 LOOP
  doc_id:=ids[idx];
  SELECT count(*) INTO matches
  FROM pg_catalog.jsonb_array_elements(listing) r
  WHERE r->>'documentId'=doc_id::text
   AND r->>'createdByActor'='true'
   AND r->>'workflowState'='draft'
   AND r->>'revision'='2';
  IF matches<>1 THEN RAISE EXCEPTION 'All Documents signed list missing creator Draft %',types[idx]; END IF;

  SELECT count(*) INTO matches
  FROM pg_catalog.jsonb_array_elements(page->'rows') r
  WHERE r->>'documentId'=doc_id::text
   AND r->>'createdByActor'='true'
   AND r->>'workflowState'='draft'
   AND r->>'revision'='2';
  IF matches<>1 THEN RAISE EXCEPTION 'All Documents signed page missing creator Draft %',types[idx]; END IF;
 END LOOP;

 SELECT count(*) INTO doc_count
 FROM public.tradelink_documents d WHERE d.id=ANY(ids) AND d.created_by=actor
  AND d.workflow_state='draft' AND d.revision=2;
 SELECT count(*) INTO board_item_count
 FROM public.work_board_items i WHERE i.id IN (
  SELECT d.board_item_id FROM public.tradelink_documents d WHERE d.id=ANY(ids)
 );
 IF doc_count<>6 OR board_item_count<>6
 THEN RAISE EXCEPTION 'Six-module final persistence counts mismatch: documents %, Board items %',
  doc_count,board_item_count; END IF;

 RAISE NOTICE 'CP_TL_CREATE_NEW_02_USER_SIX_MODULE_CREATE_NUMBERING_READ_UPDATE_BOARD_LIST_PAGE_REVISION_REPLAY_PASS';
END;
$accept$;

-- Existing manager creation continues through the unchanged generic Board RPC.
DO $manager$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc_id uuid:=pg_catalog.gen_random_uuid();
 payload jsonb:=pg_catalog.jsonb_build_object(
  'documentType','quotation','documentNumber','',
  'vendorId','watchdog-sales','templateId','watchdog-sales-reference-v1',
  'customerName','CP02 Manager Path QA','customerEmail','manager@example.test',
  'validity','30 days','deliveryCommitment','Within 14 days',
  'paymentTerms','Net 30','verifiedByEmail','msenagan@watchdogautomation.com.ph',
  'approvedByEmail','asenagan@watchdogautomation.com.ph',
  'quoteStatus','Working on it','currency','PHP','terms','Manager path terms',
  'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'id','cp02-manager-line','kind','item','description','Manager path item',
   'quantity',1,'unitPrice',1)));
 receipt jsonb;
BEGIN
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
  '11111111-1111-4111-8111-111111111111',true);
 IF public.work_board_access(board,'manage') IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Manager fixture lost its existing Board Manager capability';
 END IF;
 receipt:=public.tl03_document_create(board,doc_id,payload,'draft');
 IF receipt->>'operation'<>'create' OR receipt->>'revision'<>'1'
  OR receipt->>'documentNumber' !~ '^Q-[0-9]{6,}$'
  OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
   WHERE i.id=(receipt->>'boardItemId')::uuid
    AND i.board_id=board AND i.title=receipt->>'documentNumber')
 THEN RAISE EXCEPTION 'Existing Board Manager create path regressed: %',receipt; END IF;
END;
$manager$;
ROLLBACK;
