-- CP-TL-REVISION-HISTORY-01 disposable PostgreSQL 17 acceptance.
\set ON_ERROR_STOP on
DO $baseline$
BEGIN
 IF (SELECT count(*) FROM private.tradelink_document_revision_snapshots
  WHERE document_id='99999999-9999-4999-8999-999999999992'
   AND revision=1 AND snapshot_source='baseline')<>1
 THEN RAISE EXCEPTION 'Existing current revision was not backfilled as baseline'; END IF;
END $baseline$;
INSERT INTO private.tradelink_document_reviews(
 document_id,board_id,workspace_id,document_revision,stage,assigned_email,actor_id,recorded_at
) VALUES
 ('99999999-9999-4999-8999-999999999992','264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '00000000-0000-4000-8000-000000000001',1,'primary','revision-primary@example.test',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','2026-11-16T08:10:00Z'),
 ('99999999-9999-4999-8999-999999999992','264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '00000000-0000-4000-8000-000000000001',1,'secondary','revision-secondary@example.test',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-11-16T08:15:00Z');
UPDATE public.tradelink_documents
 SET workflow_state='approved',updated_by='cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  updated_at='2026-11-16T08:15:00Z'
 WHERE id='99999999-9999-4999-8999-999999999992' AND revision=1;
UPDATE public.tradelink_documents
 SET revision=2,content=content || jsonb_build_object('remarks','Second revision content'),
  workflow_state='for-approval',updated_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  updated_at='2026-11-17T08:00:00Z'
 WHERE id='99999999-9999-4999-8999-999999999992' AND revision=1;
INSERT INTO private.tradelink_document_reviews(
 document_id,board_id,workspace_id,document_revision,stage,assigned_email,actor_id,recorded_at
) VALUES('99999999-9999-4999-8999-999999999992',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','00000000-0000-4000-8000-000000000001',
 2,'primary','revision-primary@example.test','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '2026-11-17T08:10:00Z');
DO $integrity$
BEGIN
 IF (SELECT count(*) FROM private.tradelink_document_revision_snapshots
  WHERE document_id='99999999-9999-4999-8999-999999999992')<>2
 THEN RAISE EXCEPTION 'Revision 2 was not captured'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots
  WHERE document_id='99999999-9999-4999-8999-999999999992'
   AND revision=2 AND snapshot_source='captured'
   AND content->>'remarks'='Second revision content')
 THEN RAISE EXCEPTION 'Revision 2 content mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots
  WHERE document_id='99999999-9999-4999-8999-999999999992'
   AND revision=1 AND content ? 'remarks')
 THEN RAISE EXCEPTION 'Revision 1 was overwritten'; END IF;
END $integrity$;
DO $guard$
BEGIN
 BEGIN
  UPDATE public.tradelink_documents SET content=content||jsonb_build_object('remarks','illegal same-revision edit')
   WHERE id='99999999-9999-4999-8999-999999999992' AND revision=2;
  RAISE EXCEPTION 'Expected same-revision content guard to reject the update';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  UPDATE private.tradelink_document_revision_snapshots SET content=content||jsonb_build_object('tamper',true)
   WHERE document_id='99999999-9999-4999-8999-999999999992' AND revision=1;
  RAISE EXCEPTION 'Expected immutable snapshot update to be rejected';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  DELETE FROM private.tradelink_document_revision_snapshots
   WHERE document_id='99999999-9999-4999-8999-999999999992' AND revision=1;
  RAISE EXCEPTION 'Expected immutable snapshot delete to be rejected';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $guard$;
DO $acl$
BEGIN
 IF NOT has_function_privilege('authenticated','public.tl03_document_revision_bundle(uuid,uuid,bigint)','EXECUTE')
  OR has_function_privilege('anon','public.tl03_document_revision_bundle(uuid,uuid,bigint)','EXECUTE')
  OR has_table_privilege('authenticated','private.tradelink_document_revision_snapshots','SELECT')
 THEN RAISE EXCEPTION 'Revision history RPC/table grants are incorrect'; END IF;
END $acl$;
SET request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET request.jwt.claim.session_id='11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
DO $manager_read$
DECLARE prior jsonb; latest jsonb; bundle jsonb;
BEGIN
 bundle:=public.tl03_document_revision_bundle('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '99999999-9999-4999-8999-999999999992',NULL);
 IF bundle->>'currentRevision'<>'2' OR jsonb_array_length(bundle->'revisions')<>2
 THEN RAISE EXCEPTION 'Revision history bundle does not match current document'; END IF;
 prior:=public.tl03_document_revision_bundle('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '99999999-9999-4999-8999-999999999992',1)->'selected';
 latest:=public.tl03_document_revision_bundle('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '99999999-9999-4999-8999-999999999992',2)->'selected';
 IF prior->>'revision'<>'1' OR prior->>'workflow_state'<>'approved' OR prior->>'approved'<>'true'
  OR prior->'content'->>'documentNumber'<>'Q-REV-HISTORY-001'
  OR prior->'content'->>'remarks' IS NOT NULL
 THEN RAISE EXCEPTION 'Historical approved revision 1 was not returned exactly'; END IF;
 IF latest->>'revision'<>'2' OR latest->>'workflow_state'<>'for-approval'
  OR latest->>'approved'<>'false'
  OR latest->'content'->>'remarks'<>'Second revision content'
 THEN RAISE EXCEPTION 'Pending revision 2 was incorrectly approved or altered'; END IF;
 IF public.tl03_document_revision_bundle('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '99999999-9999-4999-8999-999999999992',99)->'selected' IS DISTINCT FROM 'null'::jsonb
 THEN RAISE EXCEPTION 'Unknown revision should not return a selected payload'; END IF;
END $manager_read$;
RESET ROLE;
SET request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET request.jwt.claim.session_id='22222222-2222-4222-8222-222222222222';
SET ROLE authenticated;
DO $existing_manager_boundary$
BEGIN
 BEGIN
  PERFORM public.tl03_document_revision_bundle('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '99999999-9999-4999-8999-999999999992',1);
  RAISE EXCEPTION 'Expected existing TradeLink manager boundary to deny a non-manager';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $existing_manager_boundary$;
RESET ROLE;
SELECT 'PASS: baseline backfill, immutable snapshots, revision-bound writes, exact historical retrieval and approved-only revision state' AS result;
