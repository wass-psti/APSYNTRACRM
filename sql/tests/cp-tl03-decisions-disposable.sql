-- Synthetic signed commercial approvals/rejections, PostgreSQL 17 only.
-- All test writes, account emails and role fixtures are transaction-rolled back.
\set ON_ERROR_STOP on
BEGIN;
UPDATE auth.users SET email=CASE id
 WHEN 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid THEN 'approver@example.test'
 WHEN 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid THEN 'reviewer@example.test'
 ELSE email END,email_confirmed_at=now()
WHERE id IN('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid);
UPDATE public.work_board_members SET role='owner'
 WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
 AND user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);

DO $create_signed$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='70000000-aaaa-4000-8000-000000000001';
 direct_doc uuid:='70000000-aaaa-4000-8000-000000000002';
 payment_doc uuid:='70000000-aaaa-4000-8000-000000000003';
 unassigned_doc uuid:='70000000-aaaa-4000-8000-000000000004';
 payload jsonb; result jsonb;
BEGIN
 payload:='{"documentType":"quotation","documentNumber":"Q-DECIDE-01",
 "customerName":"Synthetic buyer","customerEmail":"buyer@example.test",
 "validity":"30 days","deliveryCommitment":"Within 2 weeks","paymentTerms":"Net 30",
 "verifiedBy":"Signed Reviewer","verifiedByEmail":"reviewer@example.test",
 "approvedBy":"Signed Approver","approvedByEmail":"approver@example.test",
 "items":[{"id":"line-1","kind":"item","description":"Fixture service",
 "quantity":2,"unitPrice":100}]}'::jsonb;
 PERFORM public.tl03_document_commit(board,doc,0,'create',payload);
 result:=public.tl03_document_submit(board,doc,1);
 IF result->>'state'<>'submitted' THEN RAISE EXCEPTION 'Reviewed quote submit failed'; END IF;
 -- The assigned approver cannot waive a source-required signed reviewer.
 BEGIN
  PERFORM public.tl03_document_decide(board,doc,2,'approve',NULL);
  RAISE EXCEPTION 'Commercial approval bypassed assigned review';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- An email-confirmed manager cannot reject unless assigned as approver/reviewer:
 -- approver is assigned to this record so a separate unassigned case follows.
 payload:=pg_catalog.jsonb_set(payload,'{documentNumber}','"Q-DIRECT-02"'::jsonb);
 payload:=payload-'verifiedBy'-'verifiedByEmail';
 payload:=pg_catalog.jsonb_set(payload,'{approvedByEmail}',
  '"reviewer@example.test"'::jsonb);
 PERFORM public.tl03_document_commit(board,direct_doc,0,'create',payload);
 PERFORM public.tl03_document_submit(board,direct_doc,1);
 payload:='{"documentType":"payment","documentNumber":"PAY-REJECT-03",
 "customerName":"Synthetic payer","paymentParticulars":"Current account",
 "cashAmount":100,"receivedBy":"Cashier","verifiedBy":"Signed reviewer",
 "verifiedByEmail":"reviewer@example.test"}'::jsonb;
 PERFORM public.tl03_document_commit(board,payment_doc,0,'create',payload);
 PERFORM public.tl03_document_submit(board,payment_doc,1);
 BEGIN
  PERFORM public.tl03_document_decide(board,payment_doc,2,'reject','Needs correction');
  RAISE EXCEPTION 'Unassigned General Manager rejected payment';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 payload:=pg_catalog.jsonb_set(payload,'{documentType}','"quotation"'::jsonb);
 payload:=pg_catalog.jsonb_set(payload,'{documentNumber}','"Q-UNASSIGNED-04"'::jsonb);
 payload:=payload-'verifiedBy'-'verifiedByEmail';
 payload:=payload-'receivedBy'-'paymentParticulars'-'cashAmount';
 payload:=payload||'{"customerEmail":"buyer@example.test",
 "validity":"30 days","deliveryCommitment":"Within 2 weeks","paymentTerms":"Net 30",
 "approvedBy":"Manager",
 "items":[{"id":"line-2","kind":"item","description":"Fixture",
 "quantity":1,"unitPrice":10}]}'::jsonb;
 PERFORM public.tl03_document_commit(board,unassigned_doc,0,'create',payload);
 PERFORM public.tl03_document_submit(board,unassigned_doc,1);
 BEGIN
  PERFORM public.tl03_document_decide(board,unassigned_doc,2,'approve',NULL);
  RAISE EXCEPTION 'Free-text approver name allowed approval';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $create_signed$;
-- Reviewer is a genuine signed General Manager in this workspace.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '33333333-3333-4333-8333-333333333333',true);
DO $review_and_decide$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='70000000-aaaa-4000-8000-000000000001';
 direct_doc uuid:='70000000-aaaa-4000-8000-000000000002';
 payment_doc uuid:='70000000-aaaa-4000-8000-000000000003';
 r jsonb;d public.tradelink_documents%rowtype;
BEGIN
 PERFORM public.tl03_document_review(board,doc,2,'review',NULL);
 -- The signed reviewer is NOT the assigned commercial approver.
 BEGIN
  PERFORM public.tl03_document_decide(board,doc,3,'approve',NULL);
  RAISE EXCEPTION 'Reviewer escalated to final approver';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=public.tl03_document_decide(board,direct_doc,2,'approve',NULL);
 IF r->>'state'<>'approved' OR r->>'from'<>'submitted' OR
  (r->>'revision')::integer<>3 THEN
  RAISE EXCEPTION 'Authorized commercial approval without assigned verifier failed'; END IF;
 SELECT * INTO d FROM public.tradelink_documents WHERE id=direct_doc;
 IF d.workflow_state<>'approved' OR d.revision<>3 OR
  NOT EXISTS(SELECT 1 FROM public.work_board_items i
   WHERE i.id=d.board_item_id AND i.title=d.document_number
     AND i.updated_at=d.updated_at AND i.updated_by=d.updated_by) OR
  NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=direct_doc AND e.revision=3 AND e.operation='approved'
    AND e.actor_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    AND e.metadata->>'from'='submitted' AND e.metadata->>'to'='approved'
    AND e.metadata->>'decidedAt' IS NOT NULL)
 THEN RAISE EXCEPTION 'Signed direct approval/Board/audit parity failed'; END IF;
 BEGIN
  PERFORM public.tl03_document_decide(board,direct_doc,2,'approve',NULL);
  RAISE EXCEPTION 'Duplicate or stale commercial approval accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_commit(board,direct_doc,3,'update',
   (SELECT content FROM public.tradelink_documents WHERE id=direct_doc));
  RAISE EXCEPTION 'Approved document still editable through Draft API';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Payment cannot be approved: it requires a separate operational completion.
 BEGIN
  PERFORM public.tl03_document_decide(board,payment_doc,2,'approve',NULL);
  RAISE EXCEPTION 'Payment completion was replaced by commercial approval';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 FOR r IN SELECT pg_catalog.jsonb_build_object('reason',reason) FROM
  pg_catalog.unnest(ARRAY[
   '', '  ','No',pg_catalog.repeat('X',1501),E'Line\nbreak']) AS reason LOOP
  BEGIN
   PERFORM public.tl03_document_decide(board,payment_doc,2,'reject',
    r->>'reason');
   RAISE EXCEPTION 'Malformed signed rejection reason accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 r:=public.tl03_document_decide(board,payment_doc,2,'reject',
  'Payment reference does not match the received remittance');
 SELECT * INTO d FROM public.tradelink_documents WHERE id=payment_doc;
 IF r->>'state'<>'rejected' OR r->>'from'<>'submitted' OR
  (r->>'revision')::integer<>3 OR d.workflow_state<>'rejected'
  OR d.revision<>3 OR
  NOT EXISTS(SELECT 1 FROM public.work_board_items i
   WHERE i.id=d.board_item_id AND i.updated_at=d.updated_at
     AND i.updated_by=d.updated_by) OR
  NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=payment_doc AND e.revision=3
    AND e.operation='rejected'
    AND e.metadata->>'reason'=
      'Payment reference does not match the received remittance') OR
  (public.tl03_document_history(board,payment_doc,10))->0->>'operation'<>'rejected'
 THEN RAISE EXCEPTION 'Signed rejection reason/history/Board parity failed'; END IF;
 BEGIN
  PERFORM public.tl03_document_decide(board,payment_doc,3,'reject','Repeat');
  RAISE EXCEPTION 'Rejected payment permitted a duplicate decision';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $review_and_decide$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);
DO $final_approval$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='70000000-aaaa-4000-8000-000000000001';
 r jsonb; d public.tradelink_documents%rowtype;
BEGIN
 r:=public.tl03_document_decide(board,doc,3,'approve',NULL);
 SELECT * INTO d FROM public.tradelink_documents WHERE id=doc;
 IF r->>'state'<>'approved' OR r->>'from'<>'under-review'
  OR (r->>'revision')::integer<>4 OR d.workflow_state<>'approved'
  OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=doc AND e.revision=4 AND e.operation='approved'
     AND e.metadata->>'from'='under-review'
     AND e.metadata->>'decidedAt' IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
   WHERE i.id=d.board_item_id AND i.updated_at=d.updated_at
    AND i.updated_by=d.updated_by)
 THEN RAISE EXCEPTION 'Signed assigned final approval after review failed'; END IF;
END $final_approval$;
-- Employee and foreign workspace cannot execute decisions.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '22222222-2222-4222-8222-222222222222',true);
DO $employee_denied$
BEGIN
 BEGIN
  PERFORM public.tl03_document_decide(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '70000000-aaaa-4000-8000-000000000001',4,'reject','Denied user');
  RAISE EXCEPTION 'Employee attempted a signed final decision';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $employee_denied$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '44444444-4444-4444-8444-444444444444',true);
DO $foreign_denied$
BEGIN
 BEGIN
  PERFORM public.tl03_document_decide(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '70000000-aaaa-4000-8000-000000000001',4,'approve',NULL);
  RAISE EXCEPTION 'Foreign workspace attempted final decision';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign_denied$;
RESET ROLE;
ROLLBACK;
