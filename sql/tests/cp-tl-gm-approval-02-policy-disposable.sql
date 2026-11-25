\set ON_ERROR_STOP on
-- Synthetic users on the isolated fixture database only.
UPDATE auth.users SET email='asenagan@watchdogautomation.com.ph',email_confirmed_at=now() WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

UPDATE auth.users SET email='other-manager@example.test',email_confirmed_at=now() WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
INSERT INTO auth.sessions(id,user_id) VALUES ('55555555-5555-4555-8555-555555555555','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
INSERT INTO public.work_board_members(board_id,user_id,role)
 VALUES('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','viewer');
DO $test$
DECLARE
 gm uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 supervisor uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 other_manager uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 ws uuid:='00000000-0000-4000-8000-000000000001';
 grp uuid:='867aeecd-ea67-4e2f-aec7-1207e2ebe20f';
 q jsonb:='{"documentType":"quotation","documentNumber":"Q-GM-POLICY-TEST","verifiedByEmail":"aacsenagan@watchdogautomation.com.ph","approvedByEmail":"asenagan@watchdogautomation.com.ph"}';
 po jsonb:='{"documentType":"po","verifiedBy":"aacsenagan@watchdogautomation.com.ph","approvedBy":"asenagan@watchdogautomation.com.ph"}';
 doc uuid:=gen_random_uuid(); item uuid:=gen_random_uuid();
 receipt jsonb; history jsonb; listing jsonb; refused boolean:=false;
 po_doc uuid:=gen_random_uuid(); revised_doc uuid:=gen_random_uuid();
BEGIN
 PERFORM set_config('request.jwt.claim.sub',gm::text,true);
 ASSERT private.tl03_gm_approval_policy(board,gm,'quotation',q)='gm-sales-supervisor-exempt-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'po',po)='gm-sales-supervisor-exempt-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'po',po||'{"verifiedBy":"other-manager@example.test"}')='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'quotation',q-'approvedByEmail')='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'quotation',q||'{"approvedByEmail":"aacsenagan@watchdogautomation.com.ph"}')='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'esi',po)='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'payment',po)='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'packing',po)='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'delivery',po)='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',gm,'quotation',q)='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy(board,supervisor,'quotation',q)='standard-dual-v1';
 PERFORM set_config('request.jwt.claim.sub',other_manager::text,true);
 ASSERT private.tl03_gm_approval_policy(board,other_manager,'quotation',q)='standard-dual-v1';
 ASSERT private.tl03_gm_approval_policy(board,gm,'quotation',q)='standard-dual-v1';
 PERFORM set_config('request.jwt.claim.sub',gm::text,true);
 -- The Sales Supervisor's availability must not block an exempt submission.
 UPDATE public.profiles SET status='inactive' WHERE id=supervisor;
 PERFORM set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);
 q:=q||'{"documentNumber":"","date":"2026-11-25"}';
 SET LOCAL ROLE authenticated;
 receipt:=public.tl03_document_create(board,doc,q,'for-approval');
 ASSERT receipt->>'state'='for-approval';
 ASSERT receipt->>'revision'='1';
 item:=(receipt->>'boardItemId')::uuid;
 receipt:=public.tl03_document_create(board,doc,q,'for-approval');
 ASSERT receipt->>'idempotent'='true';
 ASSERT (receipt->>'boardItemId')::uuid=item;
 q:=public.tl03_document_read(board,doc)->'content';
 RESET ROLE;
 UPDATE public.profiles SET status='active' WHERE id=supervisor;
 ASSERT private.tl03_revision_approval_policy(doc,1)='gm-sales-supervisor-exempt-v1';
 ASSERT NOT private.tl03_approval_evidence_complete(doc,1);
 PERFORM set_config('request.jwt.claim.sub',supervisor::text,true);
 PERFORM set_config('request.jwt.claim.session_id','55555555-5555-4555-8555-555555555555',true);
 SET LOCAL ROLE authenticated;
 BEGIN
  PERFORM public.tl03_record_review_stage(board,doc,1,'primary');
 EXCEPTION WHEN SQLSTATE 'PT409' THEN refused:=true;
 END;
 RESET ROLE;
 ASSERT refused;
 PERFORM set_config('request.jwt.claim.sub',gm::text,true);
 PERFORM set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);
 SET LOCAL ROLE authenticated;
 receipt:=public.tl03_record_review_stage(board,doc,1,'secondary');
 ASSERT receipt->>'state'='approved';
 ASSERT receipt->>'approvalPolicy'='gm-sales-supervisor-exempt-v1';
 ASSERT receipt->'primaryAt'='null'::jsonb;
 ASSERT receipt->>'secondaryAt' IS NOT NULL;
 receipt:=public.tl03_record_review_stage(board,doc,1,'secondary');
 ASSERT receipt->>'idempotent'='true';
 ASSERT public.tl03_document_review_stages(board,doc)->>'approvalPolicy'='gm-sales-supervisor-exempt-v1';
 RESET ROLE;
 ASSERT private.tl03_approval_evidence_complete(doc,1);
 -- The next revision submitted by a different actor is standard; older evidence remains unchanged.
 PERFORM set_config('request.jwt.claim.sub',other_manager::text,true);
 UPDATE public.tradelink_documents SET revision=2,workflow_state='for-approval',updated_by=other_manager,content=q||'{"remarks":"Second revision"}' WHERE id=doc;
 ASSERT private.tl03_revision_approval_policy(doc,2)='standard-dual-v1';
 ASSERT NOT private.tl03_approval_evidence_complete(doc,2);
 INSERT INTO private.tradelink_document_reviews(document_id,board_id,workspace_id,document_revision,stage,assigned_email,actor_id)
 VALUES(doc,board,ws,2,'secondary','asenagan@watchdogautomation.com.ph',gm);
 ASSERT NOT private.tl03_approval_evidence_complete(doc,2);
 INSERT INTO private.tradelink_document_reviews(document_id,board_id,workspace_id,document_revision,stage,assigned_email,actor_id)
 VALUES(doc,board,ws,2,'primary','aacsenagan@watchdogautomation.com.ph',supervisor);
 ASSERT private.tl03_approval_evidence_complete(doc,2);
 ASSERT private.tl03_approval_evidence_complete(doc,1);
 PERFORM set_config('request.jwt.claim.sub',gm::text,true);
 PERFORM set_config('request.jwt.claim.session_id','11111111-1111-4111-8111-111111111111',true);
 SET LOCAL ROLE authenticated;
 history:=public.tl03_document_revision_bundle(board,doc,1);
 ASSERT history->'selected'->>'approved'='true';
 ASSERT history->'selected'->>'approval_policy'='gm-sales-supervisor-exempt-v1';
 ASSERT history->'selected'->'primary_reviewed_at'='null'::jsonb;
 ASSERT history->'selected'->>'secondary_reviewed_at' IS NOT NULL;
 ASSERT history->'revisions'->0->>'approvalPolicy'='standard-dual-v1';
 ASSERT history->'revisions'->1->>'approvalPolicy'='gm-sales-supervisor-exempt-v1';
 listing:=public.tl03_documents_page(board,'','all','all','active','visible',NULL,NULL,50);
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(listing->'rows') r WHERE r->>'documentId'=doc::text AND r->>'approvalPolicy'='standard-dual-v1');
 -- Actual PO signed create, review and approved supersession.
 po:=po||'{"documentNumber":"","date":"2026-11-25"}';
 receipt:=public.tl03_document_create(board,po_doc,po,'draft');
 ASSERT receipt->>'state'='draft';
 po:=public.tl03_document_read(board,po_doc)->'content';
 receipt:=public.tl03_document_save(board,po_doc,1,'update',po,'for-approval');
 ASSERT receipt->>'revision'='2' AND receipt->>'state'='for-approval';
 receipt:=public.tl03_record_review_stage(board,po_doc,2,'secondary');
 ASSERT receipt->>'state'='approved' AND receipt->>'approvalPolicy'='gm-sales-supervisor-exempt-v1';
 receipt:=public.tl03_document_save(board,po_doc,2,'revise-approved',po||'{"remarks":"Updated PO"}','for-approval');
 ASSERT receipt->>'revision'='3' AND receipt->>'state'='for-approval';
 history:=public.tl03_document_revision_bundle(board,po_doc,2);
 ASSERT history->'selected'->>'approved'='true';
 ASSERT history->'selected'->>'approval_policy'='gm-sales-supervisor-exempt-v1';
 receipt:=public.tl03_record_review_stage(board,po_doc,3,'secondary');
 ASSERT receipt->>'state'='approved';
 -- Re-save a pre-policy pending revision without editing its content.
 -- The new revision is explicit; the original snapshot remains standard.
 po:=public.tl03_document_read(board,'88888888-8888-4888-8888-888888888881')->'content';
 receipt:=public.tl03_document_save(board,'88888888-8888-4888-8888-888888888881',1,'update',po,'for-approval');
 ASSERT receipt->>'revision'='2' AND receipt->>'state'='for-approval';
 receipt:=public.tl03_document_save(board,'88888888-8888-4888-8888-888888888881',1,'update',po,'for-approval');
 ASSERT receipt->>'revision'='2' AND receipt->>'idempotent'='true';
 history:=public.tl03_document_revision_bundle(board,'88888888-8888-4888-8888-888888888881',1);
 ASSERT history->'selected'->>'approval_policy'='standard-dual-v1';
 ASSERT history->'revisions'->0->>'approvalPolicy'='gm-sales-supervisor-exempt-v1';
 receipt:=public.tl03_record_review_stage(board,'88888888-8888-4888-8888-888888888881',2,'secondary');
 ASSERT receipt->>'state'='approved';
 RESET ROLE;
 RAISE NOTICE 'PASS: policy, isolation, revision, signed review and idempotent retry assertions';
END $test$;
