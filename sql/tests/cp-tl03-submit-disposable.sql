-- Genuine signed Draft submission, Board/audit, role and CAS tests.
-- Runs in an isolated PostgreSQL 17 fixture; changes rolled back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);
DO $submit_signed$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 quotation uuid:='11111111-bbbb-4111-8111-111111111111';
 packing uuid:='22222222-bbbb-4222-8222-222222222222';
 invalid uuid:='33333333-bbbb-4333-8333-333333333333';
 payment uuid:='44444444-bbbb-4444-8444-444444444444';
 receipt jsonb; content jsonb; row public.tradelink_documents%rowtype;
BEGIN
 content:='{"documentType":"quotation","documentNumber":"Q-SUBMIT-01",
 "customerName":"Synthetic prospect","customerEmail":"test@example.test",
 "validity":"30 days","deliveryCommitment":"2 weeks","paymentTerms":"Net 30",
 "approvedBy":"Intended manager",
 "items":[{"id":"item-1","kind":"item","description":"Fixture material",
 "quantity":1,"unitPrice":50}]}'::jsonb;
 PERFORM public.tl03_document_commit(board,quotation,0,'create',content);
 receipt:=public.tl03_document_submit(board,quotation,1);
 SELECT * INTO row FROM public.tradelink_documents WHERE id=quotation;
 IF receipt->>'state'<>'submitted' OR receipt->>'operation'<>'submit'
  OR (receipt->>'revision')::integer<>2 OR row.workflow_state<>'submitted'
  OR row.content IS DISTINCT FROM content
  OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
   WHERE i.id=row.board_item_id AND i.title=row.document_number
    AND i.updated_at=row.updated_at AND i.updated_by=row.updated_by)
  OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=quotation AND e.revision=2 AND e.operation='submitted'
    AND e.metadata->>'from'='draft' AND e.metadata->>'to'='submitted')
 THEN RAISE EXCEPTION 'Signed quotation submission, Board or audit mismatch'; END IF;
 BEGIN
  PERFORM public.tl03_document_submit(board,quotation,1);
  RAISE EXCEPTION 'Duplicate/stale workflow submission accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_commit(board,quotation,2,'update',content);
  RAISE EXCEPTION 'Submitted document editable via Draft API';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 content:='{"documentType":"packing","documentNumber":"PACK-SUBMIT-01",
 "customerName":"Consignee","referenceNumber":"SO-2026-001",
 "items":[{"id":"item-1","kind":"item","description":"Packed fixture",
 "quantity":2,"unitPrice":0,"unit":"box"}]}'::jsonb;
 PERFORM public.tl03_document_commit(board,packing,0,'create',content);
 receipt:=public.tl03_document_submit(board,packing,1);
 IF receipt->>'state'<>'completed' OR
  (SELECT workflow_state FROM public.tradelink_documents WHERE id=packing)<>'completed'
  OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events
   WHERE document_id=packing AND operation='completed' AND revision=2)
 THEN RAISE EXCEPTION 'Source Packing List direct completion failed'; END IF;
 -- Draft-save permits historical minimal content; submission must refuse
 -- incomplete records rather than treating them as approved.
 content:='{"documentType":"esi","documentNumber":"ESI-INCOMPLETE-01",
 "customerName":"Client","items":[{"id":"1","kind":"item",
 "description":"Goods","quantity":1,"unitPrice":100}]}'::jsonb;
 PERFORM public.tl03_document_commit(board,invalid,0,'create',content);
 BEGIN
  PERFORM public.tl03_document_submit(board,invalid,1);
  RAISE EXCEPTION 'Missing ESI verification and tax details accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 IF (SELECT revision FROM public.tradelink_documents WHERE id=invalid)<>1
  OR (SELECT count(*) FROM public.tradelink_document_events WHERE document_id=invalid)<>1
 THEN RAISE EXCEPTION 'Invalid ESI submit mutated records'; END IF;
 content:='{"documentType":"payment","documentNumber":"PAY-INCOMPLETE-01",
 "customerName":"Payor","paymentParticulars":"Test",
 "receivedBy":"Cashier","verifiedBy":"Finance","cashAmount":0}'::jsonb;
 PERFORM public.tl03_document_commit(board,payment,0,'create',content);
 BEGIN
  PERFORM public.tl03_document_submit(board,payment,1);
  RAISE EXCEPTION 'Zero-value payment submission was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- Complete six-module source submit parity with signed writes, immutable
 -- document identity, single Board projection, and revision-bound event audit.
 FOR content IN SELECT value FROM pg_catalog.jsonb_array_elements('[
  {"documentType":"esi","documentNumber":"ESI-SUBMIT-01","customerName":"Client","customerTin":"TIN-123","verifiedBy":"Finance","approvedBy":"Manager","items":[{"id":"a","kind":"item","description":"Product","quantity":1,"unitPrice":100}]},
  {"documentType":"delivery","documentNumber":"DR-SUBMIT-01","customerName":"Consignee","referenceNumber":"SO-123","checkedBy":"QC","deliveredBy":"Logistics","items":[{"id":"b","kind":"item","description":"Shipped","quantity":1,"unitPrice":0}]},
  {"documentType":"payment","documentNumber":"AR-SUBMIT-01","customerName":"Payer","paymentParticulars":"Invoice settlement","receivedBy":"Cashier","verifiedBy":"Finance","cashAmount":100},
  {"documentType":"po","documentNumber":"PO-SUBMIT-01","customerName":"Supplier","targetDeliveryDate":"2026-12-01","paymentTerms":"Net 30","verifiedBy":"Finance","approvedBy":"Manager","items":[{"id":"c","kind":"item","description":"Equipment","quantity":1,"unitPrice":100}]}
 ]'::jsonb) LOOP
  DECLARE
   fixture_id uuid;
   fixture_receipt jsonb;
   fixture_doc public.tradelink_documents%rowtype;
  BEGIN
   fixture_id:=pg_catalog.gen_random_uuid();
   PERFORM public.tl03_document_commit(board,fixture_id,0,'create',content);
   fixture_receipt:=public.tl03_document_submit(board,fixture_id,1);
   SELECT * INTO fixture_doc FROM public.tradelink_documents WHERE id=fixture_id;
   IF fixture_receipt->>'state'<>'submitted'
     OR fixture_receipt->>'operation'<>'submit'
     OR (fixture_receipt->>'revision')::int<>2
     OR fixture_doc.workflow_state<>'submitted' OR fixture_doc.revision<>2
     OR fixture_doc.content IS DISTINCT FROM content
     OR (SELECT count(*) FROM public.work_board_items
         WHERE id=fixture_doc.board_item_id AND title=fixture_doc.document_number
           AND updated_at=fixture_doc.updated_at)<>1
     OR (SELECT count(*) FROM public.tradelink_document_events
         WHERE document_id=fixture_id AND operation='submitted' AND revision=2
           AND metadata->>'from'='draft' AND metadata->>'to'='submitted')=0
   THEN RAISE EXCEPTION 'Six-module signed submit parity failed for %',content->>'documentType';
   END IF;
  END;
 END LOOP;
END $submit_signed$;
-- Employee with Board membership but no General Manager role is always denied.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '22222222-2222-4222-8222-222222222222',true);
DO $employee_denial$
BEGIN
 BEGIN
  PERFORM public.tl03_document_submit(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '33333333-bbbb-4333-8333-333333333333',1);
  RAISE EXCEPTION 'Employee workflow escalation allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $employee_denial$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '44444444-4444-4444-8444-444444444444',true);
DO $foreign_denial$
BEGIN
 BEGIN
  PERFORM public.tl03_document_submit(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '33333333-bbbb-4333-8333-333333333333',1);
  RAISE EXCEPTION 'Foreign-workspace signed submission allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign_denial$;
RESET ROLE;
ROLLBACK;
