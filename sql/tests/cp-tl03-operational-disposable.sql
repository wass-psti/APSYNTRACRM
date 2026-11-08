-- Isolated PostgreSQL 17, all signed fixtures rolled back; no real funds,
-- external account or live document changes.
\set ON_ERROR_STOP on
BEGIN;
UPDATE auth.users SET email=CASE id
 WHEN 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid THEN 'operations-manager@example.test'
 WHEN 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid THEN 'quality-manager@example.test'
 ELSE email END,email_confirmed_at=now()
WHERE id IN ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid);
UPDATE public.work_board_members SET role='owner'
 WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
 AND user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);
DO $prepare$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 delivery uuid:='80000000-aaaa-4000-8000-000000000001';
 payment uuid:='80000000-aaaa-4000-8000-000000000002';
 quotation uuid:='80000000-aaaa-4000-8000-000000000003';
 packing uuid:='80000000-aaaa-4000-8000-000000000004';
 payload jsonb;receipt jsonb;d public.tradelink_documents%rowtype;
BEGIN
 payload:='{"documentType":"delivery","documentNumber":"DR-OPERATE-01",
 "customerName":"Synthetic consignee","referenceNumber":"SO-2026-001",
 "checkedBy":"quality-manager@example.test",
 "deliveredBy":"operations-manager@example.test",
 "items":[{"id":"item-1","kind":"item","description":"Shipment",
 "quantity":2,"unitPrice":0}]}'::jsonb;
 PERFORM public.tl03_document_commit(board,delivery,0,'create',payload);
 PERFORM public.tl03_document_submit(board,delivery,1);
 BEGIN
  PERFORM public.tl03_document_operate(board,delivery,2,'complete',NULL);
  RAISE EXCEPTION 'Delivery completed without current QC and delivery evidence';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_operate(board,delivery,2,'record-checked',NULL);
  RAISE EXCEPTION 'Non-QC manager recorded another assigned actor timestamp';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 payload:='{"documentType":"payment","documentNumber":"PAY-OPERATE-02",
 "customerName":"Synthetic remitter","paymentParticulars":"Synthetic receipt",
 "cashAmount":40,"receivedBy":"quality-manager@example.test",
 "verifiedBy":"Payment reviewer",
 "verifiedByEmail":"quality-manager@example.test"}'::jsonb;
 PERFORM public.tl03_document_commit(board,payment,0,'create',payload);
 PERFORM public.tl03_document_submit(board,payment,1);
 BEGIN
  PERFORM public.tl03_document_operate(board,payment,2,'complete',NULL);
  RAISE EXCEPTION 'Payment completed without signed receipt/review';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 payload:='{"documentType":"quotation","documentNumber":"Q-OPERATE-03",
 "customerName":"Prospective buyer","customerEmail":"buyer@example.test",
 "validity":"30 days","deliveryCommitment":"Within 14 days","paymentTerms":"Net 30",
 "approvedBy":"Operations manager",
 "approvedByEmail":"operations-manager@example.test",
 "items":[{"id":"item-1","kind":"item","description":"Service",
 "quantity":1,"unitPrice":100}]}'::jsonb;
 PERFORM public.tl03_document_commit(board,quotation,0,'create',payload);
 PERFORM public.tl03_document_submit(board,quotation,1);
 BEGIN
  PERFORM public.tl03_document_operate(board,quotation,2,'complete',NULL);
  RAISE EXCEPTION 'Commercial document completed without signed approval';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.tl03_document_decide(board,quotation,2,'approve',NULL);
 receipt:=public.tl03_document_operate(board,quotation,3,'complete',NULL);
 SELECT * INTO d FROM public.tradelink_documents WHERE id=quotation;
 IF receipt->>'state'<>'completed' OR (receipt->>'revision')::int<>4
  OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=quotation AND e.operation='completed' AND e.revision=4)
  OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
   WHERE i.id=d.board_item_id AND i.updated_at=d.updated_at
     AND i.updated_by=d.updated_by)
 THEN RAISE EXCEPTION 'Commercial approved completion / Board audit mismatch'; END IF;
 BEGIN
  PERFORM public.tl03_document_operate(board,quotation,3,'complete',NULL);
  RAISE EXCEPTION 'Stale duplicate commercial completion accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_operate(board,quotation,4,'reopen','No');
  RAISE EXCEPTION 'Too-short reopening reason was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 receipt:=public.tl03_document_operate(board,quotation,4,'reopen',
  'Commercial order requires a genuinely revised Draft');
 SELECT * INTO d FROM public.tradelink_documents WHERE id=quotation;
 IF receipt->>'state'<>'draft' OR (receipt->>'revision')::int<>5
  OR d.workflow_state<>'draft'
  OR d.content->>'documentNumber'<>'Q-OPERATE-03'
  OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=quotation AND e.revision=5 AND e.operation='reopened'
    AND e.metadata->>'reason'='Commercial order requires a genuinely revised Draft')
 THEN RAISE EXCEPTION 'Commercial reopening did not preserve Draft/audit'; END IF;
 payload:='{"documentType":"packing","documentNumber":"PACK-OPERATE-04",
 "customerName":"Synthetic consignee","referenceNumber":"SO-2026-001",
 "items":[{"id":"item-1","kind":"item","description":"Packed cartons",
 "quantity":2,"unitPrice":0,"unit":"box"}]}'::jsonb;
 PERFORM public.tl03_document_commit(board,packing,0,'create',payload);
 PERFORM public.tl03_document_submit(board,packing,1);
 BEGIN
  PERFORM public.tl03_document_operate(board,packing,2,'complete',NULL);
  RAISE EXCEPTION 'Packing List received duplicate completion after submit';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 receipt:=public.tl03_document_operate(board,packing,2,'reopen',
  'Packing quantities require another signed document revision');
 IF receipt->>'state'<>'draft' OR (receipt->>'revision')::int<>3
 THEN RAISE EXCEPTION 'Packing List reopening failed'; END IF;
END $prepare$;
-- Named QC/receipt actor (separate signed, confirmed manager identity).
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '33333333-3333-4333-8333-333333333333',true);
DO $record_signed$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 delivery uuid:='80000000-aaaa-4000-8000-000000000001';
 payment uuid:='80000000-aaaa-4000-8000-000000000002';
 receipt jsonb;d public.tradelink_documents%rowtype;
BEGIN
 receipt:=public.tl03_document_operate(board,delivery,2,'record-checked',NULL);
 SELECT * INTO d FROM public.tradelink_documents WHERE id=delivery;
 IF receipt->>'field'<>'checkedAt' OR receipt->>'state'<>'submitted'
  OR (receipt->>'revision')::int<>3
  OR (receipt->>'recordedAt')::timestamptz IS DISTINCT FROM d.updated_at
  OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=delivery AND e.revision=3 AND e.operation='operational-record'
    AND e.metadata->>'field'='checkedAt'
    AND e.actor_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid)
 THEN RAISE EXCEPTION 'Signed QC operational timestamp or audit mismatch'; END IF;
 BEGIN
  PERFORM public.tl03_document_operate(board,delivery,3,'record-checked',NULL);
  RAISE EXCEPTION 'Duplicate QC operational timestamp accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 receipt:=public.tl03_document_operate(board,payment,2,'record-received',NULL);
 IF receipt->>'field'<>'receivedAt' OR (receipt->>'revision')::int<>3
 THEN RAISE EXCEPTION 'Payment signed receipt event failed'; END IF;
 -- Payment verification is another source-defined, email-bound signed review.
 PERFORM public.tl03_document_review(board,payment,3,'review',NULL);
END $record_signed$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);
DO $complete_signed$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 delivery uuid:='80000000-aaaa-4000-8000-000000000001';
 payment uuid:='80000000-aaaa-4000-8000-000000000002';
 receipt jsonb;d public.tradelink_documents%rowtype;
BEGIN
 BEGIN
  PERFORM public.tl03_document_operate(board,delivery,3,'complete',NULL);
  RAISE EXCEPTION 'Delivery completed before logistics timestamp';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 receipt:=public.tl03_document_operate(board,delivery,3,'record-delivered',NULL);
 IF receipt->>'field'<>'deliveredAt' OR (receipt->>'revision')::int<>4
 THEN RAISE EXCEPTION 'Assigned logistics timestamp failed'; END IF;
 receipt:=public.tl03_document_operate(board,delivery,4,'complete',NULL);
 SELECT * INTO d FROM public.tradelink_documents WHERE id=delivery;
 IF receipt->>'state'<>'completed' OR (receipt->>'revision')::int<>5
  OR d.workflow_state<>'completed'
  OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
   WHERE i.id=d.board_item_id AND i.updated_at=d.updated_at
     AND i.updated_by=d.updated_by)
 THEN RAISE EXCEPTION 'Signed delivery completion/Board projection mismatch'; END IF;
 receipt:=public.tl03_document_operate(board,payment,4,'complete',NULL);
 SELECT * INTO d FROM public.tradelink_documents WHERE id=payment;
 IF receipt->>'state'<>'completed' OR (receipt->>'revision')::int<>5
  OR d.workflow_state<>'completed' OR
  NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=payment AND e.operation='completed' AND e.revision=5)
 THEN RAISE EXCEPTION 'Signed payment completion missing receipt/review evidence'; END IF;
 receipt:=public.tl03_document_operate(board,delivery,5,'reopen',
  'Returned shipment needs a fresh signed QC and delivery cycle');
 IF receipt->>'state'<>'draft' THEN RAISE EXCEPTION 'Delivery re-open failed'; END IF;
 PERFORM public.tl03_document_submit(board,delivery,6);
 BEGIN
  PERFORM public.tl03_document_operate(board,delivery,7,'complete',NULL);
  RAISE EXCEPTION 'Historical QC/delivery timestamps reused after reopen';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_operate(board,payment,5,'reopen',NULL);
  RAISE EXCEPTION 'Missing reason accepted on payment reopen';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $complete_signed$;
-- Deny employee and foreign-workspace signatures regardless of action/ID.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '22222222-2222-4222-8222-222222222222',true);
DO $employee_denied$
BEGIN
 BEGIN
  PERFORM public.tl03_document_operate(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '80000000-aaaa-4000-8000-000000000001',7,'record-checked',NULL);
  RAISE EXCEPTION 'Nonmanager operational escalation permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $employee_denied$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '44444444-4444-4444-8444-444444444444',true);
DO $foreign_denied$
BEGIN
 BEGIN
  PERFORM public.tl03_document_operate(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '80000000-aaaa-4000-8000-000000000001',7,'complete',NULL);
  RAISE EXCEPTION 'Foreign workspace operational escalation permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign_denied$;
RESET ROLE;
ROLLBACK;
