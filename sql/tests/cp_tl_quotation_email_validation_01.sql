-- Run after CP-TL-LARGE-SAVE-02 and CP-TL-QUOTATION-EMAIL-VALIDATION-01.
-- Exercises the public signed save/read RPCs under the authenticated test role.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);

DO $tests$
DECLARE
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 valid_id uuid:='a1111111-aaaa-4111-8111-111111111111';
 invalid_id uuid:='b2222222-bbbb-4222-8222-222222222222';
 valid_payload jsonb;
 invalid_payload jsonb;
 receipt jsonb;
 readback jsonb;
 email_case jsonb;
BEGIN
 valid_payload:=pg_catalog.jsonb_build_object(
  'documentType','quotation','documentNumber','Q-EMAIL-VALIDATION-01',
  'customerName','Email Validation QA','customerEmail','client@example.com',
  'customerPhone','09170000001',
  'verifiedBy','Sales Supervisor','verifiedByEmail','aacsenagan@watchdogautomation.com.ph',
  'approvedBy','Management','approvedByEmail','dsenagan@watchdogautomation.com.ph',
  'validity','30 days','deliveryCommitment','2 weeks','paymentTerms','Net 30',
  'currency','PHP','vatType','12',
  'items',pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('id','email-line-1','kind','item',
    'description','Email validation item 1','quantity',1,'unitPrice',10,'unit','pc'),
   pg_catalog.jsonb_build_object('id','email-line-2','kind','item',
    'description','Email validation item 2','quantity',2,'unitPrice',20,'unit','pc')
  )
 );

 -- Public signed save RPC: a valid email is accepted and persisted.
 receipt:=public.tl03_document_save(board,valid_id,0,'create',valid_payload,'draft');
 IF (receipt->>'revision')::integer<>1 OR receipt->>'operation'<>'create' THEN
  RAISE EXCEPTION 'Valid quotation email was not accepted by the public save RPC.'; END IF;

 -- Retrying the same create command returns its original receipt.
 receipt:=public.tl03_document_save(board,valid_id,0,'create',valid_payload,'draft');
 IF receipt->>'idempotent'<>'true' OR (receipt->>'revision')::integer<>1 THEN
  RAISE EXCEPTION 'Valid quotation email create replay was not idempotent.'; END IF;

 readback:=public.tl03_document_read(board,valid_id);
 IF (readback->>'revision')::integer<>1
  OR readback->'content'->>'customerEmail'<>'client@example.com' THEN
  RAISE EXCEPTION 'Valid quotation email signed readback failed.'; END IF;

 -- A malformed email is rejected on update before a new revision is written.
 invalid_payload:=pg_catalog.jsonb_set(valid_payload,'{customerEmail}',
  pg_catalog.to_jsonb('not-an-email'::text),true);
 BEGIN
  PERFORM public.tl03_document_save(board,valid_id,1,'update',invalid_payload,'draft');
  RAISE EXCEPTION 'Malformed quotation email update unexpectedly passed.' USING ERRCODE='P0001';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM<>'Invalid Quotation contact email.' THEN RAISE; END IF;
 END;

 -- A malformed email is also rejected on create, before any document exists.
 invalid_payload:=pg_catalog.jsonb_set(valid_payload,'{documentNumber}',
  pg_catalog.to_jsonb('Q-EMAIL-VALIDATION-BAD'::text),true);
 invalid_payload:=pg_catalog.jsonb_set(invalid_payload,'{customerEmail}',
  pg_catalog.to_jsonb('bad-email'::text),true);
 BEGIN
  PERFORM public.tl03_document_save(board,invalid_id,0,'create',invalid_payload,'draft');
  RAISE EXCEPTION 'Malformed quotation email create unexpectedly passed.' USING ERRCODE='P0001';
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM<>'Invalid Quotation contact email.' THEN RAISE; END IF;
 END;

 readback:=public.tl03_document_read(board,valid_id);
 IF (readback->>'revision')::integer<>1
  OR readback->'content'->>'customerEmail'<>'client@example.com' THEN
  RAISE EXCEPTION 'Rejected malformed-email update changed the valid saved document.'; END IF;
 readback:=public.tl03_document_read(board,invalid_id);
 IF readback IS NOT NULL THEN
  RAISE EXCEPTION 'Rejected malformed-email create left a readable document.'; END IF;


END
$tests$;

RESET ROLE;
DO $validator_tests$
DECLARE
 base jsonb:=pg_catalog.jsonb_build_object(
  'documentType','quotation','documentNumber','Q-EMAIL-VALIDATOR-EDGE-QA',
  'customerName','Email Validation QA','customerEmail','client@example.com');
 email_case jsonb;
BEGIN
 -- Frontend-compatible edge cases and non-quotation behavior.
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','Buyer+sales@sub.example.test'));
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','buyer'||pg_catalog.chr(96)||'name@example.com'));
 PERFORM private.tl03_validate_draft(base||pg_catalog.jsonb_build_object(
  'customerEmail','a@b.c'));
 PERFORM private.tl03_validate_draft(pg_catalog.jsonb_set(
  pg_catalog.jsonb_set(base,'{customerEmail}',pg_catalog.to_jsonb(''::text),true),
  '{customerPhone}',pg_catalog.to_jsonb('09170000001'::text),true));
 PERFORM private.tl03_validate_draft(pg_catalog.jsonb_build_object(
  'documentType','esi','documentNumber','ESI-EMAIL-VALIDATION-QA',
  'customerEmail','test@email'));

 FOREACH email_case IN ARRAY ARRAY[
  pg_catalog.jsonb_build_object('customerEmail','test@email'),
  pg_catalog.jsonb_build_object('customerEmail','bad-email'),
  pg_catalog.jsonb_build_object('customerEmail','client @example.com'),
  pg_catalog.jsonb_build_object('customerEmail','client@example .com'),
  pg_catalog.jsonb_build_object('customerEmail','a@@example.com'),
  pg_catalog.jsonb_build_object('customerEmail','a@-example.test'),
  pg_catalog.jsonb_build_object('customerEmail','a@exam!ple.test'),
  pg_catalog.jsonb_build_object('customerEmail','buyer@example')
 ] LOOP
  BEGIN
   PERFORM private.tl03_validate_draft(base||email_case);
   RAISE EXCEPTION 'Malformed quotation email unexpectedly passed validation: %',email_case;
  EXCEPTION WHEN SQLSTATE '22023' THEN
   IF SQLERRM<>'Invalid Quotation contact email.' THEN RAISE; END IF;
  END;
 END LOOP;
END
$validator_tests$;

DO $verify$
DECLARE
 valid_doc public.tradelink_documents%rowtype;
BEGIN
 SELECT * INTO valid_doc FROM public.tradelink_documents
  WHERE id='a1111111-aaaa-4111-8111-111111111111';
 IF valid_doc.id IS NULL OR valid_doc.revision<>1
  OR valid_doc.content->>'customerEmail'<>'client@example.com'
  OR pg_catalog.jsonb_array_length(valid_doc.content->'items')<>2
  OR valid_doc.board_item_id IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.work_board_items
   WHERE id=valid_doc.board_item_id AND title='Q-EMAIL-VALIDATION-01') THEN
  RAISE EXCEPTION 'Valid quotation email document persistence mismatch.'; END IF;
 IF (SELECT count(*) FROM private.tradelink_document_revision_snapshots
   WHERE document_id=valid_doc.id)<>1
  OR (SELECT count(*) FROM public.tradelink_document_events
   WHERE document_id=valid_doc.id)<>1 THEN
  RAISE EXCEPTION 'Valid quotation email create generated duplicate revisions or events.'; END IF;
 IF EXISTS(SELECT 1 FROM public.tradelink_documents
   WHERE id='b2222222-bbbb-4222-8222-222222222222')
  OR EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots
   WHERE document_id='b2222222-bbbb-4222-8222-222222222222')
  OR EXISTS(SELECT 1 FROM public.tradelink_document_events
   WHERE document_id='b2222222-bbbb-4222-8222-222222222222')
  OR EXISTS(SELECT 1 FROM public.work_board_items
   WHERE title='Q-EMAIL-VALIDATION-BAD') THEN
  RAISE EXCEPTION 'Rejected malformed quotation email create left partial persisted state.'; END IF;
END
$verify$;
ROLLBACK;
SELECT 'CP_TL_QUOTATION_EMAIL_VALIDATION_01_SIGNED_RPC_PASS' AS result;
