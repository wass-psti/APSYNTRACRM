-- CP-TL-RH08: isolated signed manager supersedes an already Approved revision.
\set ON_ERROR_STOP on
INSERT INTO private.tradelink_document_reviews(
 document_id,board_id,workspace_id,document_revision,stage,assigned_email,actor_id,recorded_at
) VALUES
 ('99999999-9999-4999-8999-999999999992','264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '00000000-0000-4000-8000-000000000001',1,'primary','revision-primary@example.test',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-11-16T08:10:00Z'),
 ('99999999-9999-4999-8999-999999999992','264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '00000000-0000-4000-8000-000000000001',1,'secondary','revision-secondary@example.test',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-11-16T08:15:00Z');
UPDATE public.tradelink_documents SET workflow_state='approved',
 updated_by='cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 updated_at='2026-11-16T08:15:00Z'
 WHERE id='99999999-9999-4999-8999-999999999992' AND revision=1;
SET request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET request.jwt.claim.session_id='11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
DO $approved_to_new$
DECLARE board uuid:='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88';
 doc uuid:='99999999-9999-4999-8999-999999999992';
 original jsonb; new_content jsonb; result jsonb; bundle jsonb;
BEGIN
 SELECT content INTO original FROM public.tradelink_documents WHERE id=doc;
 new_content:=original||jsonb_build_object(
  'vendorId','watchdog-sales','templateId','watchdog-sales-reference-v1',
  'remarks','New negotiated commercial terms',
  'items',jsonb_build_array(jsonb_build_object(
   'id','rh08-line-1','kind','item','description','Negotiated revised item',
   'quantity',1,'unitPrice',105)));
 -- Existing normal update is still not allowed to modify an Approved record.
 BEGIN
  PERFORM public.tl03_document_save(board,doc,1,'update',new_content,'for-approval');
  RAISE EXCEPTION 'Normal update unexpectedly edited Approved document';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 -- No cross-company, numbering or reviewer substitution during supersession.
 BEGIN
  PERFORM public.tl03_document_save(board,doc,1,'revise-approved',
    new_content||jsonb_build_object('documentNumber','Q-CHANGED-ILLEGAL'),'for-approval');
  RAISE EXCEPTION 'Approved revision number was modified';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_save(board,doc,1,'revise-approved',
    new_content||jsonb_build_object('verifiedByEmail','someoneelse@example.test'),'for-approval');
  RAISE EXCEPTION 'Approved reviewer assignment was modified';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN
  PERFORM public.tl03_document_save(board,doc,1,'revise-approved',new_content,'draft');
  RAISE EXCEPTION 'Approved revision skipped two-reviewer workflow';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 WHEN SQLSTATE '22023' THEN NULL; END;
 result:=public.tl03_document_save(board,doc,1,'revise-approved',new_content,'for-approval');
 IF result->>'revision'<>'2' OR result->>'state'<>'for-approval'
  OR result->>'operation'<>'update' OR result->>'idempotent'<>'false'
 THEN RAISE EXCEPTION 'Supersession save response incorrect: %',result; END IF;
 result:=public.tl03_document_save(board,doc,1,'revise-approved',new_content,'for-approval');
 IF result->>'revision'<>'2' OR result->>'idempotent'<>'true'
 THEN RAISE EXCEPTION 'Exact same actor retry not idempotent: %',result; END IF;
 BEGIN
  PERFORM public.tl03_document_save(board,doc,1,'update',new_content,'for-approval');
  RAISE EXCEPTION 'Normal update misidentified supersession as a retry';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

 bundle:=public.tl03_document_revision_bundle(board,doc,1);
 IF bundle->'selected'->>'approved'<>'true'
   OR bundle->'selected'->>'workflow_state'<>'approved'
   OR bundle->'selected'->'content' IS DISTINCT FROM original
   OR bundle->'selected'->'content' ? 'vendorId'
   OR bundle->>'currentRevision'<>'2'
 THEN RAISE EXCEPTION 'Original Approved revision no longer retrievable'; END IF;
 bundle:=public.tl03_document_revision_bundle(board,doc,2);
 IF bundle->'selected'->>'approved'<>'false'
   OR bundle->'selected'->'content' IS DISTINCT FROM new_content
   OR bundle->'selected'->>'workflow_state'<>'for-approval'
 THEN RAISE EXCEPTION 'New revision incorrectly approved'; END IF;
END $approved_to_new$;
RESET ROLE;
DO $integrity$
BEGIN
 IF (SELECT count(*) FROM private.tradelink_document_revision_snapshots
  WHERE document_id='99999999-9999-4999-8999-999999999992'
    AND revision=2 AND snapshot_source='captured'
    AND content->>'remarks'='New negotiated commercial terms')<>1
 THEN RAISE EXCEPTION 'New current revision snapshot missing'; END IF;
 IF (SELECT count(*) FROM private.tradelink_document_reviews
  WHERE document_id='99999999-9999-4999-8999-999999999992'
   AND document_revision=1)<>2
  OR EXISTS(SELECT 1 FROM private.tradelink_document_reviews
   WHERE document_id='99999999-9999-4999-8999-999999999992'
    AND document_revision=2)
 THEN RAISE EXCEPTION 'Reviewer evidence leaked between revisions'; END IF;
END $integrity$;
SELECT 'PASS: Approved supersession, old immutable PDF content, two-reviewer reset, CAS and replay' as result;
-- Existing assigned accounts independently validate only the new revision.
SET request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET request.jwt.claim.session_id='22222222-2222-4222-8222-222222222222';
SET ROLE authenticated;
DO $primary_stage$
DECLARE receipt jsonb;
BEGIN
 receipt:=public.tl03_record_review_stage(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '99999999-9999-4999-8999-999999999992',2,'primary');
 IF receipt->>'state'<>'for-approval'
 THEN RAISE EXCEPTION 'First review prematurely Approved new revision'; END IF;
 BEGIN
  PERFORM public.tl03_record_review_stage(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '99999999-9999-4999-8999-999999999992',1,'primary');
  RAISE EXCEPTION 'Stale earlier review was accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $primary_stage$;
RESET ROLE;
SET request.jwt.claim.sub='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SET request.jwt.claim.session_id='33333333-3333-4333-8333-333333333333';
SET ROLE authenticated;
DO $secondary_stage$
DECLARE receipt jsonb;
BEGIN
 receipt:=public.tl03_record_review_stage(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '99999999-9999-4999-8999-999999999992',2,'secondary');
 IF receipt->>'state'<>'approved'
 THEN RAISE EXCEPTION 'Second review did not Approve new revision'; END IF;
END $secondary_stage$;
RESET ROLE;
DO $final_revisions$
DECLARE d public.tradelink_documents%rowtype;
BEGIN
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id='99999999-9999-4999-8999-999999999992';
 IF d.revision<>2 OR d.workflow_state<>'approved'
 THEN RAISE EXCEPTION 'Current revision transition differs from dual-review contract'; END IF;
 IF (SELECT count(distinct actor_id) FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=2)<>2
  OR (SELECT count(distinct actor_id) FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=1)<>2
 THEN RAISE EXCEPTION 'Distinct old/new signed reviewer evidence missing'; END IF;
 IF (SELECT content->>'remarks' FROM private.tradelink_document_revision_snapshots
  WHERE document_id=d.id AND revision=1) IS NOT NULL
 THEN RAISE EXCEPTION 'Historical revision changed after reapproval'; END IF;
END $final_revisions$;
SELECT 'PASS: two existing reviewer identities reapprove revision 2 without altering revision 1' as result;
