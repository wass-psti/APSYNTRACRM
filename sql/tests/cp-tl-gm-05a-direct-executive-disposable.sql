\set ON_ERROR_STOP on
-- Run after the existing legacy fixture; all records are disposable.
DO $test$
DECLARE
 gm uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 q jsonb:='{"documentType":"quotation","documentNumber":"","date":"2026-11-25","verifiedByEmail":"","approvedByEmail":"asenagan@watchdogautomation.com.ph"}';
 po jsonb:='{"documentType":"po","documentNumber":"","date":"2026-11-25","verifiedBy":"other-manager@example.test","approvedBy":"asenagan@watchdogautomation.com.ph"}';
 doc uuid; payload jsonb; receipt jsonb; kind text; denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',gm::text,true);
 PERFORM set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);
 ASSERT private.tl03_gm_approval_policy(board,gm,'quotation',q)='gm-sales-supervisor-exempt-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'po',po)='gm-sales-supervisor-exempt-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'quotation',q||'{"approvedByEmail":"other-manager@example.test"}')='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'esi',q)='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy(board,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','quotation',q)='standard-dual-v1';
 FOREACH kind IN ARRAY ARRAY['quotation','po'] LOOP
  doc:=gen_random_uuid();
  payload:=CASE WHEN kind='quotation' THEN q ELSE po END;
  SET LOCAL ROLE authenticated;
  receipt:=public.tl03_document_create(board,doc,payload,'draft');
  ASSERT receipt->>'state'='draft';
  payload:=public.tl03_document_read(board,doc)->'content';
  receipt:=public.tl03_document_save(board,doc,1,'update',payload,'for-approval');
  ASSERT receipt->>'state'='for-approval';
  denied:=false;
  BEGIN
   PERFORM public.tl03_record_review_stage(board,doc,2,'primary');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true;
  END;
  ASSERT denied;
  receipt:=public.tl03_record_review_stage(board,doc,2,'secondary');
  ASSERT receipt->>'state'='approved';
  ASSERT receipt->'primaryAt'='null'::jsonb';
  ASSERT receipt->>'secondaryAt' IS NOT NULL;
  receipt:=public.tl03_record_review_stage(board,doc,2,'secondary');
  ASSERT receipt->>'idempotent'='true';
  RESET ROLE;
  ASSERT private.tl03_approval_evidence_complete(doc,2);
 END LOOP;
 RAISE NOTICE 'PASS: direct executive QT and PO approval without designated intermediate reviewer';
END $test$;
