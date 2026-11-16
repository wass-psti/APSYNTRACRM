-- CP-TL-10A-RUNTIME-02: genuine signed six-module save and All Documents readback.
-- PostgreSQL 17 disposable CI database only. Every synthetic row is rolled back.
-- Uses the exact tl03_document_save RPC called by TradeLinkDraftWorkspace.save().
\set ON_ERROR_STOP on
BEGIN;

-- Existing disposable accounts are reused; no production identity or role is changed.
UPDATE auth.users
SET email=CASE id
 WHEN 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid THEN 'tl10a-primary@example.test'
 WHEN 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid THEN 'tl10a-secondary@example.test'
END,
email_confirmed_at=pg_catalog.now()
WHERE id IN (
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid
);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);

DO $accept$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 types text[]:=ARRAY['esi','quotation','packing','delivery','payment','po'];
 identifiers uuid[]:=ARRAY[
  '10000000-aaaa-4000-8000-000000000001'::uuid,
  '10000000-aaaa-4000-8000-000000000002'::uuid,
  '10000000-aaaa-4000-8000-000000000003'::uuid,
  '10000000-aaaa-4000-8000-000000000004'::uuid,
  '10000000-aaaa-4000-8000-000000000005'::uuid,
  '10000000-aaaa-4000-8000-000000000006'::uuid
 ];
 typ text; doc_id uuid; payload jsonb; revised jsonb; stale_payload jsonb;
 receipt jsonb; saved jsonb; page jsonb; board_item uuid;
 matching_rows integer; idx integer;
 primary_email text:='tl10a-primary@example.test';
 secondary_email text:='tl10a-secondary@example.test';
BEGIN
 IF to_regprocedure('public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)') IS NULL
  OR to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL
  OR to_regprocedure('public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)') IS NULL
 THEN RAISE EXCEPTION 'CP-TL-10A requires the production save, read and All Documents RPC contracts'; END IF;

 FOR idx IN 1..6 LOOP
  typ:=types[idx];doc_id:=identifiers[idx];
  payload:=CASE typ
   WHEN 'esi' THEN pg_catalog.jsonb_build_object(
    'documentType',typ,'documentNumber','CP-TL-10A-SAVE-ESI-001',
    'customerName','Synthetic ESI customer','customerTin','TIN-TEST-001',
    'verifiedBy',primary_email,'approvedBy',secondary_email,
    'currency','PHP','remarks','Initial ESI values',
    'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
     'id','esi-line-1','kind','item','description','Synthetic ESI line',
     'quantity',2,'unitPrice',150)))
   WHEN 'quotation' THEN pg_catalog.jsonb_build_object(
    'documentType',typ,'documentNumber','CP-TL-10A-SAVE-QUOTATION-001',
    'customerName','Synthetic quotation customer','customerEmail','buyer@example.test',
    'validity','30 days','deliveryCommitment','Within 14 days','paymentTerms','Net 30',
    'verifiedBy','Sales Supervisor','verifiedByEmail',primary_email,
    'approvedBy','Management','approvedByEmail',secondary_email,
    'currency','PHP','remarks','Initial quotation values',
    'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
     'id','quotation-line-1','kind','item','description','Synthetic service',
     'quantity',2,'unitPrice',150)))
   WHEN 'packing' THEN pg_catalog.jsonb_build_object(
    'documentType',typ,'documentNumber','CP-TL-10A-SAVE-PACKING-001',
    'customerName','Synthetic consignee','referenceNumber','SO-TEST-001',
    'verifiedBy',primary_email,'approvedBy',secondary_email,
    'remarks','Initial packing values',
    'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
     'id','packing-line-1','kind','item','description','Synthetic packed goods',
     'quantity',2,'unitPrice',0,'unit','box')))
   WHEN 'delivery' THEN pg_catalog.jsonb_build_object(
    'documentType',typ,'documentNumber','CP-TL-10A-SAVE-DELIVERY-001',
    'customerName','Synthetic recipient','referenceNumber','SO-TEST-001',
    'checkedBy',primary_email,'deliveredBy',secondary_email,
    'remarks','Initial delivery values',
    'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
     'id','delivery-line-1','kind','item','description','Synthetic delivered goods',
     'quantity',1,'unitPrice',0,'unit','pc','serialNumber','SERIAL-TEST-001')))
   WHEN 'payment' THEN pg_catalog.jsonb_build_object(
    'documentType',typ,'documentNumber','CP-TL-10A-SAVE-PAYMENT-001',
    'customerName','Synthetic payor','paymentParticulars','Synthetic receipt',
    'receivedBy',primary_email,'verifiedBy',secondary_email,
    'cashAmount',25,'chequeAmount',400,'bankName','Synthetic bank',
    'chequeNumber','CHEQUE-TEST-001','remarks','Initial payment values')
   ELSE pg_catalog.jsonb_build_object(
    'documentType',typ,'documentNumber','CP-TL-10A-SAVE-PO-001',
    'customerName','Synthetic supplier','targetDeliveryDate','2026-12-01',
    'paymentTerms','Net 30','verifiedBy',primary_email,'approvedBy',secondary_email,
    'currency','PHP','remarks','Initial PO values',
    'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
     'id','po-line-1','kind','item','description','Synthetic materials',
     'quantity',2,'unitPrice',150)))
  END;

  -- Exact production save RPC: revision zero, create, default For Approval.
  receipt:=public.tl03_document_save(board,doc_id,0,'create',payload,'for-approval');
  IF receipt->>'documentId'<>doc_id::text
   OR receipt->>'revision'<>'1'
   OR receipt->>'state'<>'for-approval'
   OR receipt->>'operation'<>'create'
   OR receipt->>'idempotent'<>'false'
  THEN RAISE EXCEPTION 'Signed create receipt mismatch for %: %',typ,receipt; END IF;
  board_item:=(receipt->>'boardItemId')::uuid;

  saved:=public.tl03_document_read(board,doc_id);
  IF saved->'content' IS DISTINCT FROM payload
   OR saved->>'board_item_id' IS DISTINCT FROM board_item::text
   OR saved->>'document_type' IS DISTINCT FROM typ
   OR saved->>'document_number' IS DISTINCT FROM payload->>'documentNumber'
   OR saved->>'workflow_state'<>'for-approval'
   OR (saved->>'revision')::integer<>1
   OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
    WHERE i.id=board_item AND i.board_id=board
     AND i.title=payload->>'documentNumber' AND i.archived_at IS NULL)
  THEN RAISE EXCEPTION 'Signed read / Board projection mismatch for %',typ; END IF;

  -- Exact create retry must return the original receipt without duplicates.
  receipt:=public.tl03_document_save(board,doc_id,0,'create',payload,'for-approval');
  IF receipt->>'idempotent'<>'true'
   OR receipt->>'boardItemId'<>board_item::text
   OR (SELECT count(*) FROM public.work_board_items
       WHERE board_id=board AND title=payload->>'documentNumber')<>1
   OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc_id)<>1
  THEN RAISE EXCEPTION 'Idempotent create retry duplicated data for %',typ; END IF;

  -- Update one module-specific value plus remarks, retaining the same workflow.
  revised:=pg_catalog.jsonb_set(payload,'{remarks}',
   pg_catalog.to_jsonb('Revision two values for '||typ));
  IF typ='payment' THEN
   revised:=pg_catalog.jsonb_set(revised,'{cashAmount}','27'::jsonb);
  ELSIF typ='delivery' THEN
   revised:=pg_catalog.jsonb_set(revised,'{items,0,serialNumber}',
    '"SERIAL-TEST-002"'::jsonb);
  ELSIF typ<>'packing' THEN
   revised:=pg_catalog.jsonb_set(revised,'{items,0,unitPrice}','175'::jsonb);
  END IF;
  receipt:=public.tl03_document_save(board,doc_id,1,'update',revised,'for-approval');
  IF receipt->>'documentId'<>doc_id::text
   OR receipt->>'boardItemId'<>board_item::text
   OR receipt->>'revision'<>'2'
   OR receipt->>'state'<>'for-approval'
   OR receipt->>'operation'<>'update'
   OR receipt->>'idempotent'<>'false'
  THEN RAISE EXCEPTION 'Signed update receipt mismatch for %: %',typ,receipt; END IF;

  saved:=public.tl03_document_read(board,doc_id);
  IF saved->'content' IS DISTINCT FROM revised
   OR (saved->>'revision')::integer<>2
   OR saved->>'workflow_state'<>'for-approval'
   OR NOT EXISTS(SELECT 1 FROM public.tradelink_documents d
    JOIN public.work_board_items i ON i.id=d.board_item_id
    WHERE d.id=doc_id AND d.board_id=board AND d.board_item_id=board_item
     AND d.revision=2 AND d.content=revised
     AND i.title=d.document_number AND i.archived_at IS NULL
     AND i.updated_at=d.updated_at AND i.updated_by=d.updated_by)
   OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc_id)<>2
  THEN RAISE EXCEPTION 'Revision-two read / Board / audit mismatch for %',typ; END IF;

  -- An exact retry is idempotent; a changed stale payload is rejected.
  receipt:=public.tl03_document_save(board,doc_id,1,'update',revised,'for-approval');
  IF receipt->>'idempotent'<>'true' OR receipt->>'revision'<>'2'
   OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc_id)<>2
  THEN RAISE EXCEPTION 'Idempotent update retry failed for %',typ; END IF;
  stale_payload:=pg_catalog.jsonb_set(revised,'{remarks}',
   pg_catalog.to_jsonb('Stale competing payload for '||typ));
  BEGIN
   PERFORM public.tl03_document_save(board,doc_id,1,'update',stale_payload,'for-approval');
   RAISE EXCEPTION 'Stale changed payload was accepted for %',typ;
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

  -- All Documents uses the same signed persisted revision and Board item.
  page:=public.tl03_documents_page(board,'','all','all','active',NULL,NULL,50);
  SELECT count(*) INTO matching_rows
  FROM pg_catalog.jsonb_array_elements(page->'rows') row_data
  WHERE row_data->>'documentId'=doc_id::text
   AND row_data->>'boardItemId'=board_item::text
   AND row_data->>'documentType'=typ
   AND row_data->>'documentNumber'=payload->>'documentNumber'
   AND row_data->>'workflowState'='for-approval'
   AND row_data->>'archived'='false'
   AND (row_data->>'revision')::integer=2;
  IF matching_rows<>1 OR page->>'hasMore'<>'false'
  THEN RAISE EXCEPTION 'All Documents page did not expose saved revision for %: %',typ,page; END IF;
 END LOOP;

 page:=public.tl03_documents_page(board,'','all','all','active',NULL,NULL,50);
 IF pg_catalog.jsonb_array_length(page->'rows')<>6
  OR page->>'hasMore'<>'false'
  OR (SELECT count(*) FROM public.tradelink_documents WHERE board_id=board)<>6
  OR (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>6
  OR (SELECT count(*) FROM public.tradelink_document_events WHERE board_id=board)<>12
  OR (SELECT count(*) FROM public.work_board_events
      WHERE board_id=board AND event_type IN
       ('tradelink.document.create','tradelink.document.update'))<>12
 THEN RAISE EXCEPTION 'Six-module final count, audit or non-approval invariant failed'; END IF;

 RAISE NOTICE 'CP-TL-10A genuine signed six-module create/read/retry/update/CAS/Board/All Documents/audit PASS';
END $accept$;

RESET ROLE;
DO $no_approval_events$
BEGIN
 IF (SELECT count(*) FROM private.tradelink_document_reviews)<>0 THEN
  RAISE EXCEPTION 'Save-only acceptance unexpectedly created approval events';
 END IF;
END $no_approval_events$;
ROLLBACK;
