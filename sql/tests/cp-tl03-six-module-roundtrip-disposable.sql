-- Genuine six-module signed create/read/edit/Board/audit assertions.
-- PostgreSQL 17 SYNTHETIC fixture only. Entire test rolls back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);
DO $six_module$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 types text[]:=ARRAY['esi','quotation','delivery','packing','payment','po'];
 identifiers uuid[]:=ARRAY[
  '11111111-aaaa-4111-8111-111111111111'::uuid,
  '22222222-aaaa-4222-8222-222222222222'::uuid,
  '33333333-aaaa-4333-8333-333333333333'::uuid,
  '44444444-aaaa-4444-8444-444444444444'::uuid,
  '55555555-aaaa-4555-8555-555555555555'::uuid,
  '66666666-aaaa-4666-8666-666666666666'::uuid
 ];
 typ text; doc_id uuid; details jsonb; payload jsonb; revised jsonb;
 receipt jsonb; saved jsonb; listing jsonb; board_item uuid; idx integer;
BEGIN
 FOR idx IN 1..6 LOOP
  typ:=types[idx];doc_id:=identifiers[idx];
  details:=CASE typ
   WHEN 'esi' THEN '{"customerTin":"TIN-0001","verifiedBy":"Finance","approvedBy":"Manager","currency":"PHP","items":[{"id":"item-a","kind":"item","description":"Goods","quantity":2,"unitPrice":150}]}'::jsonb
   WHEN 'quotation' THEN '{"customerEmail":"contact@example.test","validity":"30 days","deliveryCommitment":"Within 14 days","paymentTerms":"Net 30","approvedBy":"Manager","currency":"PHP","items":[{"id":"item-a","kind":"item","description":"Services","quantity":2,"unitPrice":150}]}'::jsonb
   WHEN 'delivery' THEN '{"referenceNumber":"SO-7","checkedBy":"QC","deliveredBy":"Logistics","items":[{"id":"item-a","kind":"item","description":"Delivery","quantity":1,"unitPrice":0,"serialNumber":"SERIAL-0001"}]}'::jsonb
   WHEN 'packing' THEN '{"referenceNumber":"SO-7","items":[{"id":"item-a","kind":"item","description":"Package","quantity":2,"unitPrice":0,"unit":"box"}]}'::jsonb
   WHEN 'payment' THEN '{"paymentParticulars":"Received on account","cashAmount":25,"chequeAmount":400,"bankName":"Bank","chequeNumber":"CHEQUE-0001","receivedBy":"Cashier","verifiedBy":"Finance"}'::jsonb
   ELSE '{"targetDeliveryDate":"2026-12-01","paymentTerms":"Net 30","verifiedBy":"Account manager","approvedBy":"Final manager","currency":"PHP","items":[{"id":"item-a","kind":"item","description":"Materials","quantity":2,"unitPrice":150}]}'::jsonb
  END;
  payload:=details||pg_catalog.jsonb_build_object(
   'documentType',typ,'documentNumber','TEST-'||pg_catalog.upper(typ)||'-001',
   'customerName','Synthetic customer','remarks','Initial signed values');
  receipt:=public.tl03_document_commit(board,doc_id,0,'create',payload);
  board_item:=(receipt->>'boardItemId')::uuid;
  saved:=public.tl03_document_read(board,doc_id);
  IF (receipt->>'revision')::integer<>1 OR (receipt->>'operation')<>'create'
   OR saved->'content' IS DISTINCT FROM payload
   OR saved->>'board_item_id' IS DISTINCT FROM board_item::text
   OR saved->>'document_type' IS DISTINCT FROM typ
   OR NOT EXISTS(SELECT 1 FROM public.work_board_items i WHERE i.id=board_item
    AND i.board_id=board AND i.title=payload->>'documentNumber')
  THEN RAISE EXCEPTION 'Six-module create/read/content/Board mismatch for %',typ; END IF;
  -- A retry with exactly the same ID and content cannot create another Board item.
  receipt:=public.tl03_document_commit(board,doc_id,0,'create',payload);
  IF receipt->>'idempotent'<>'true' THEN
   RAISE EXCEPTION 'Six-module idempotent create failed for %',typ; END IF;
  revised:=pg_catalog.jsonb_set(payload,'{remarks}',
    pg_catalog.to_jsonb('Updated signed content for '||typ));
  IF typ='payment' THEN
   revised:=pg_catalog.jsonb_set(revised,'{cashAmount}','27'::jsonb);
  ELSIF typ='delivery' THEN
   revised:=pg_catalog.jsonb_set(revised,'{items,0,serialNumber}',
    '"SERIAL-0002"'::jsonb);
  ELSIF typ<>'packing' THEN
   revised:=pg_catalog.jsonb_set(revised,'{items,0,unitPrice}','175'::jsonb);
  END IF;
  receipt:=public.tl03_document_commit(board,doc_id,1,'update',revised);
  saved:=public.tl03_document_read(board,doc_id);
  IF (receipt->>'revision')::integer<>2 OR (receipt->>'operation')<>'update'
    OR saved->'content' IS DISTINCT FROM revised
    OR saved->>'document_number' IS DISTINCT FROM payload->>'documentNumber'
    OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=doc_id)<>2
    OR NOT EXISTS(
     SELECT 1 FROM public.tradelink_documents d
     JOIN public.work_board_items i ON i.id=d.board_item_id
     WHERE d.id=doc_id AND d.revision=2 AND i.id=board_item
      AND i.title=d.document_number
      AND i.updated_at=d.updated_at AND i.updated_by=d.updated_by)
   THEN RAISE EXCEPTION 'Six-module revision/field/Board/audit mismatch for %',typ; END IF;
  BEGIN
   PERFORM public.tl03_document_commit(board,doc_id,1,'update',revised);
   RAISE EXCEPTION 'Stale update accepted for %',typ;
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  -- The All Documents response must point to the same authoritative Board item.
  listing:=public.tl03_documents_list(board,50);
  IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(listing) entry
     WHERE entry->>'documentId'=doc_id::text
      AND entry->>'boardItemId'=board_item::text
      AND entry->>'documentType'=typ
      AND entry->>'documentNumber'=payload->>'documentNumber'
      AND (entry->>'revision')::integer=2
      AND entry->>'workflowState'='draft' AND entry->>'archived'='false')<>1
  THEN RAISE EXCEPTION 'All Documents mismatch after signed update for %',typ; END IF;
  receipt:=public.tl03_document_commit(board,doc_id,2,'archive',NULL);
  IF (receipt->>'revision')::integer<>3
    OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
      WHERE i.id=board_item AND i.archived_at IS NOT NULL)
    OR (SELECT count(*) FROM pg_catalog.jsonb_array_elements(
       public.tl03_documents_list(board,50)) entry
       WHERE entry->>'documentId'=doc_id::text
       AND entry->>'archived'='true' AND (entry->>'revision')::integer=3)<>1
  THEN RAISE EXCEPTION 'Archive, Board and All Documents parity failed for %',typ; END IF;
  receipt:=public.tl03_document_commit(board,doc_id,3,'restore',NULL);
  saved:=public.tl03_document_read(board,doc_id);
  IF (receipt->>'revision')::integer<>4
    OR saved->'content' IS DISTINCT FROM revised
    OR saved->>'board_item_id' IS DISTINCT FROM board_item::text
    OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
      JOIN public.tradelink_documents d ON d.board_item_id=i.id
      WHERE d.id=doc_id AND i.id=board_item AND i.archived_at IS NULL
       AND i.updated_at=d.updated_at AND i.updated_by=d.updated_by)
    OR (SELECT count(*) FROM pg_catalog.jsonb_array_elements(
       public.tl03_documents_list(board,50)) entry
       WHERE entry->>'documentId'=doc_id::text
       AND entry->>'boardItemId'=board_item::text
       AND entry->>'archived'='false' AND (entry->>'revision')::integer=4)<>1
    OR (SELECT count(*) FROM public.tradelink_document_events
        WHERE document_id=doc_id)<>4
  THEN RAISE EXCEPTION 'Restore, signed read, Board and listing parity failed for %',typ; END IF;
 END LOOP;
 listing:=public.tl03_documents_list(board,50);
 IF pg_catalog.jsonb_array_length(listing)<>6
  OR (SELECT count(*) FROM public.tradelink_documents WHERE board_id=board)<>6
  OR (SELECT count(*) FROM public.work_board_items WHERE board_id=board)<>6
  OR (SELECT count(*) FROM public.tradelink_document_events WHERE board_id=board)<>24
 THEN RAISE EXCEPTION 'Six-module test created duplicates or unexpected audit history'; END IF;
 RAISE NOTICE 'Six TradeLink modules signed create/read/retry/update/CAS/archive/restore/Board/All Documents/audit PASS';
END $six_module$;
RESET ROLE;
ROLLBACK;
