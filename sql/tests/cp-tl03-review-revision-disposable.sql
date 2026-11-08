-- Only PostgreSQL 17 synthetic tests; no production SQL.
\set ON_ERROR_STOP on
BEGIN;
-- Synthetic role/identity setup by disposable postgres fixture owner only.
UPDATE auth.users SET email=CASE id
 WHEN 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid THEN 'creator@example.test'
 WHEN 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid THEN 'reviewer@example.test'
 ELSE NULL END,email_confirmed_at=now()
WHERE id IN('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid);
-- Existing General Manager reviewer is an editor in the basic fixture. Grant
-- ownership ONLY inside the rolled-back synthetic transaction.
UPDATE public.work_board_members SET role='owner'
 WHERE board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
 AND user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);
DO $initial$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='7c97770b-1f6b-4555-a5cb-a179788db15e';
 payload jsonb:='{"documentType":"quotation","documentNumber":"Q-REVIEW-001",
  "customerName":"Synthetic prospect","customerEmail":"client@example.test",
  "verifiedBy":"Assigned reviewer","verifiedByEmail":"reviewer@example.test",
  "validity":"30 days","deliveryCommitment":"2 weeks","paymentTerms":"Net 30",
  "approvedBy":"Approving manager","approvedByEmail":"reviewer@example.test",
  "items":[{"id":"item1","kind":"item","description":"Fixture line",
   "quantity":2,"unitPrice":100}]}'::jsonb;
 r jsonb;
BEGIN
 r:=public.tl03_document_commit(board,doc,0,'create',payload);
 IF (r->>'revision')::integer<>1 THEN
  RAISE EXCEPTION 'Review fixture create failed'; END IF;
 r:=public.tl03_document_submit(board,doc,1);
 IF r->>'state'<>'submitted' THEN RAISE EXCEPTION 'Review fixture submit failed'; END IF;
 -- A General Manager without the saved reviewer assignment is still denied.
 BEGIN
  PERFORM public.tl03_document_review(board,doc,2,'review',NULL);
  RAISE EXCEPTION 'Unassigned General Manager reviewed another user document';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_review(board,doc,2,'request-revision','Bad quote');
  RAISE EXCEPTION 'Unassigned General Manager requested revision';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $initial$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '33333333-3333-4333-8333-333333333333',true);
DO $review$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='7c97770b-1f6b-4555-a5cb-a179788db15e';
 receipt jsonb; d public.tradelink_documents%rowtype; events jsonb;
BEGIN
 receipt:=public.tl03_document_review(board,doc,2,'review',NULL);
 SELECT * INTO d FROM public.tradelink_documents WHERE id=doc;
 IF receipt->>'state'<>'under-review' OR receipt->>'from'<>'submitted'
  OR (receipt->>'revision')::integer<>3 OR d.workflow_state<>'under-review'
  OR d.content->>'documentNumber'<>'Q-REVIEW-001'
  OR NOT EXISTS(SELECT 1 FROM public.work_board_items i
    WHERE i.id=d.board_item_id AND i.updated_at=d.updated_at
     AND i.updated_by=d.updated_by)
  OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
    WHERE e.document_id=doc AND e.revision=3 AND e.operation='reviewed'
      AND e.actor_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')
 THEN RAISE EXCEPTION 'Review was not an exact signed transaction'; END IF;
 BEGIN
  PERFORM public.tl03_document_review(board,doc,2,'review',NULL);
  RAISE EXCEPTION 'Duplicate review with stale revision was accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 FOR receipt IN SELECT pg_catalog.jsonb_build_object('action','request-revision',
     'reason',reason) FROM pg_catalog.unnest(ARRAY[
      '', '  ', 'X', pg_catalog.repeat('x',1501), E'Contains\nnewline']) AS reason LOOP
  BEGIN
   PERFORM public.tl03_document_review(board,doc,3,
    receipt->>'action',receipt->>'reason');
   RAISE EXCEPTION 'Malformed revision reason accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 receipt:=public.tl03_document_review(board,doc,3,'request-revision',
  'Recalculate the commercial quantities and clarify the payment terms');
 IF receipt->>'state'<>'revision-required' OR receipt->>'from'<>'under-review'
  OR (receipt->>'revision')::integer<>4 THEN
  RAISE EXCEPTION 'Authorized revision request did not commit'; END IF;
 events:=public.tl03_document_history(board,doc,25);
 IF pg_catalog.jsonb_array_length(events)<>4 OR
    events->0->>'operation'<>'revision-requested'
    OR events->0->'metadata'->>'reason'<>
      'Recalculate the commercial quantities and clarify the payment terms'
    OR events->0->>'actorId' IS NULL
    OR pg_catalog.jsonb_array_length(public.tl03_document_history(board,doc,2))<>2
 THEN RAISE EXCEPTION 'Signed workflow history did not expose exact audited reason'; END IF;
 -- Revision edits are deliberately not authorized for archive/restore.
 BEGIN
  PERFORM public.tl03_document_commit(board,doc,4,'archive',NULL);
  RAISE EXCEPTION 'Revision-requested document was archived via Draft-only RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $review$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '11111111-1111-4111-8111-111111111111',true);
DO $edit_resubmit$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='7c97770b-1f6b-4555-a5cb-a179788db15e';
 saved jsonb; revised jsonb; receipt jsonb;
BEGIN
 saved:=public.tl03_document_read(board,doc)->'content';
 revised:=pg_catalog.jsonb_set(saved,'{remarks}','"Adjusted commercial terms"'::jsonb);
 receipt:=public.tl03_document_commit(board,doc,4,'update',revised);
 IF receipt->>'state'<>'revision-required' OR
   (receipt->>'revision')::integer<>5 OR
   (public.tl03_document_read(board,doc)->'content')->>'remarks'<>'Adjusted commercial terms'
 THEN RAISE EXCEPTION 'Revision-requested Draft edit did not persist'; END IF;
 receipt:=public.tl03_document_submit(board,doc,5);
 IF receipt->>'from'<>'revision-required' OR receipt->>'state'<>'submitted'
  OR (receipt->>'revision')::integer<>6
  OR (SELECT workflow_state FROM public.tradelink_documents WHERE id=doc)<>'submitted'
  OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events
   WHERE document_id=doc AND revision=6 AND operation='submitted'
     AND metadata->>'from'='revision-required')
 THEN RAISE EXCEPTION 'Revision resubmission lost its prior state or audit'; END IF;
END $edit_resubmit$;
-- Employee/foreign workspace denial and tampered unconfirmed signed reviewer.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '22222222-2222-4222-8222-222222222222',true);
DO $employee$
BEGIN
 BEGIN
  PERFORM public.tl03_document_review(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '7c97770b-1f6b-4555-a5cb-a179788db15e',6,'request-revision','Need changes');
  RAISE EXCEPTION 'Employee submitted workflow decision';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $employee$;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 '44444444-4444-4444-8444-444444444444',true);
DO $foreign$
BEGIN
 BEGIN
  PERFORM public.tl03_document_review(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '7c97770b-1f6b-4555-a5cb-a179788db15e',6,'request-revision','Need changes');
  RAISE EXCEPTION 'Foreign workspace submitted workflow decision';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign$;
RESET ROLE;
ROLLBACK;
