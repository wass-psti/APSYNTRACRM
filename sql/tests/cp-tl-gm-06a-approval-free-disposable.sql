\set ON_ERROR_STOP on
DO $test$
DECLARE
 gm uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid; direct_doc uuid; payload jsonb; receipt jsonb; kind text; stage_name text; denied boolean;
 historical_count bigint;
BEGIN
 SELECT count(*) INTO historical_count FROM private.tradelink_revision_approval_exemptions e
 WHERE e.policy='gm-sales-supervisor-exempt-v1' AND private.tl03_approval_evidence_complete(e.document_id,e.revision);
 ASSERT historical_count>=2, 'Historical signed executive fixtures missing';
 PERFORM set_config('request.jwt.claim.sub',gm::text,true);
 PERFORM set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);
 FOREACH kind IN ARRAY ARRAY['quotation','po'] LOOP
  payload:=jsonb_build_object('documentType',kind,'documentNumber','','date','2026-11-25');
  ASSERT private.tl03_gm_approval_policy(board,gm,kind,payload)='gm-creator-approval-free-v1';
  ASSERT private.tl03_gm_approval_policy(board,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',kind,payload)='standard-dual-v1';
  doc:=gen_random_uuid(); direct_doc:=gen_random_uuid();
  SET LOCAL ROLE authenticated;
  receipt:=public.tl03_document_create(board,doc,payload,'draft');
  ASSERT receipt->>'state'='draft';
  RESET ROLE;
  ASSERT NOT private.tl03_approval_evidence_complete(doc,1);
  SET LOCAL ROLE authenticated;
  receipt:=public.tl03_document_create(board,direct_doc,payload,'for-approval');
  ASSERT receipt->>'state'='approved', 'Direct create must complete';
  payload:=public.tl03_document_read(board,doc)->'content';
  receipt:=public.tl03_document_save(board,doc,1,'update',payload,'for-approval');
  ASSERT receipt->>'state'='approved', 'Draft completion must approve';
  receipt:=public.tl03_document_save(board,doc,1,'update',payload,'for-approval');
  ASSERT receipt->>'idempotent'='true', 'Retry must not duplicate';
  FOREACH stage_name IN ARRAY ARRAY['primary','secondary'] LOOP
   denied:=false;
   BEGIN
    PERFORM public.tl03_record_review_stage(board,doc,2,stage_name);
   EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true;
   END;
   ASSERT denied;
  END LOOP;
  RESET ROLE;
  ASSERT private.tl03_approval_evidence_complete(doc,2);
  ASSERT private.tl03_approval_evidence_complete(direct_doc,1);
  ASSERT NOT EXISTS (SELECT 1 FROM private.tradelink_document_reviews r WHERE r.document_id IN (doc,direct_doc));
  ASSERT private.tl03_revision_approval_policy(doc,2)='gm-creator-approval-free-v1';
 END LOOP;
 ASSERT (SELECT count(*) FROM private.tradelink_revision_approval_exemptions e
 WHERE e.policy='gm-sales-supervisor-exempt-v1' AND private.tl03_approval_evidence_complete(e.document_id,e.revision))=historical_count;
 RAISE NOTICE 'PASS: zero-review QT and PO completion, draft, retry, and historical evidence';
END $test$;
