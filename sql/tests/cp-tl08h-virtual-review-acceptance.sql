-- CP-TL-08H: local-only virtual secondary reviewer acceptance.
-- Run only after cp-tl03-disposable-setup.sql, cp-tl03-staged-domain.sql,
-- and 20261112091535_tradelink_for_approval_dual_review.sql in a disposable
-- PostgreSQL database. Never run against production Supabase.
-- The primary review row is seeded from the already verified production event.
-- The secondary identity is synthetic and exists only in this disposable DB.
\set ON_ERROR_STOP on
SET ROLE postgres;

DO $seed$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('private.tradelink_document_reviews') IS NULL
  OR to_regprocedure('public.tl03_record_review_stage(uuid,uuid,bigint,text)') IS NULL
 THEN RAISE EXCEPTION 'CP-TL-08H requires the disposable CP-TL-08 schema'; END IF;
END $seed$;

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('119edeed-b85c-4349-9d89-11b323ca8509','aacsenagan@watchdogautomation.com.ph',now()),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','virtual-secondary@apsyntra.test',now());
INSERT INTO public.profiles(id,status) VALUES
 ('119edeed-b85c-4349-9d89-11b323ca8509','active'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','active');
INSERT INTO public.workspace_members(workspace_id,user_id) VALUES
 ('00000000-0000-4000-8000-000000000001','119edeed-b85c-4349-9d89-11b323ca8509'),
 ('00000000-0000-4000-8000-000000000001','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
INSERT INTO public.module_role_assignments(user_id,module_id,role) VALUES
 ('119edeed-b85c-4349-9d89-11b323ca8509','tradelink','User'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','tradelink','User');
INSERT INTO public.work_board_members(board_id,user_id,role) VALUES
 ('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','119edeed-b85c-4349-9d89-11b323ca8509','viewer'),
 ('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','viewer');
INSERT INTO auth.sessions(id,user_id) VALUES
 ('66666666-6666-4666-8666-666666666666','119edeed-b85c-4349-9d89-11b323ca8509'),
 ('77777777-7777-4777-8777-777777777777','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

INSERT INTO public.work_board_items(id,board_id,group_id,title,created_by,updated_by,updated_at)
VALUES (
 'b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 '867aeecd-ea67-4e2f-aec7-1207e2ebe20f',
 'CP-TL-08H-VIRTUAL-20261113-01',
 '119edeed-b85c-4349-9d89-11b323ca8509',
 '119edeed-b85c-4349-9d89-11b323ca8509',
 '2026-11-13T04:21:41.611077Z'
);
INSERT INTO public.tradelink_documents(
 id,board_id,workspace_id,board_item_id,document_type,document_number,
 workflow_state,revision,content,created_by,updated_by,created_at,updated_at
) VALUES (
 '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 '00000000-0000-4000-8000-000000000001',
 'b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8',
 'quotation','CP-TL-08H-VIRTUAL-20261113-01','for-approval',1,
 '{"documentType":"quotation","documentNumber":"CP-TL-08H-VIRTUAL-20261113-01","verifiedByEmail":"aacsenagan@watchdogautomation.com.ph","approvedByEmail":"virtual-secondary@apsyntra.test","customerName":"Disposable acceptance only","items":[]}'::jsonb,
 '119edeed-b85c-4349-9d89-11b323ca8509',
 '119edeed-b85c-4349-9d89-11b323ca8509',
 '2026-11-12T10:01:18.564992Z','2026-11-13T04:21:41.611077Z'
);
INSERT INTO private.tradelink_document_reviews(
 document_id,board_id,workspace_id,document_revision,stage,assigned_email,actor_id,recorded_at
) VALUES (
 '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a',
 '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
 '00000000-0000-4000-8000-000000000001',1,'primary',
 'aacsenagan@watchdogautomation.com.ph',
 '119edeed-b85c-4349-9d89-11b323ca8509','2026-11-13T04:21:41.603645Z'
);

-- The validated primary identity cannot record the secondary stage.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','119edeed-b85c-4349-9d89-11b323ca8509',false);
SELECT set_config('request.jwt.claim.session_id','66666666-6666-4666-8666-666666666666',false);
DO $same_actor$
DECLARE denied boolean:=false; stages jsonb;
BEGIN
 BEGIN
  PERFORM public.tl03_record_review_stage(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a',1,'secondary');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Primary actor was accepted as secondary'; END IF;
 stages:=public.tl03_document_review_stages(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a');
 IF stages->'secondary' IS DISTINCT FROM 'null'::jsonb
 THEN RAISE EXCEPTION 'Denied same-actor attempt created a secondary review'; END IF;
END $same_actor$;

-- A distinct virtual reviewer with only existing module User + Board VIEW scope.
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',false);
SELECT set_config('request.jwt.claim.session_id','77777777-7777-4777-8777-777777777777',false);
DO $secondary$
DECLARE assigned jsonb; row_data jsonb; stages jsonb; receipt jsonb; duplicate jsonb;
BEGIN
 assigned:=public.tl03_assigned_documents('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',50);
 IF jsonb_array_length(assigned)<>1
  OR assigned->0->>'assignedStage'<>'secondary'
  OR assigned->0->>'secondaryEmail'<>'virtual-secondary@apsyntra.test'
 THEN RAISE EXCEPTION 'Virtual secondary assignment retrieval failed'; END IF;
 row_data:=public.tl03_document_read_assigned(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a');
 IF row_data->>'revision'<>'1' OR row_data->>'workflow_state'<>'for-approval'
 THEN RAISE EXCEPTION 'Assigned read returned an unexpected revision/state'; END IF;
 receipt:=public.tl03_record_review_stage(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a',1,'secondary');
 IF receipt->>'state'<>'approved' OR receipt->>'stage'<>'secondary'
  OR receipt->>'revision'<>'1' OR receipt->>'idempotent'<>'false'
  OR receipt->>'primaryAt' IS NULL OR receipt->>'secondaryAt' IS NULL
 THEN RAISE EXCEPTION 'Second review did not atomically approve current revision'; END IF;
 duplicate:=public.tl03_record_review_stage(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a',1,'secondary');
 IF duplicate->>'idempotent'<>'true' OR duplicate->>'state'<>'approved'
 THEN RAISE EXCEPTION 'Secondary retry was not idempotent'; END IF;
 stages:=public.tl03_document_review_stages(
  '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
  '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a');
 IF stages->>'state'<>'approved'
  OR stages->'primary'->>'assignedEmail'<>'aacsenagan@watchdogautomation.com.ph'
  OR stages->'secondary'->>'assignedEmail'<>'virtual-secondary@apsyntra.test'
  OR stages->'primary'->>'actorId'='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  OR stages->'secondary'->>'actorId'<>'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
 THEN RAISE EXCEPTION 'Distinct review actors were not preserved'; END IF;
 BEGIN
  PERFORM public.tl03_record_review_stage(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88',
   '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a',2,'secondary');
  RAISE EXCEPTION 'Stale document revision was accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $secondary$;
RESET ROLE;

DO $postflight$
DECLARE d public.tradelink_documents%rowtype; i public.work_board_items%rowtype;
BEGIN
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id='9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a';
 SELECT * INTO i FROM public.work_board_items
  WHERE id='b8b8b8b8-b8b8-48b8-88b8-b8b8b8b8b8b8';
 IF d.workflow_state<>'approved' OR d.revision<>1 OR d.archived_at IS NOT NULL
  OR i.title<>d.document_number OR i.archived_at IS NOT NULL
  OR i.updated_at IS DISTINCT FROM d.updated_at
  OR i.updated_by IS DISTINCT FROM d.updated_by
  OR d.updated_by<>'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid
 THEN RAISE EXCEPTION 'Approved document / Board projection postflight failed'; END IF;
 IF (SELECT count(*) FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=d.revision)<>2
  OR (SELECT count(DISTINCT actor_id) FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=d.revision)<>2
  OR (SELECT count(*) FROM public.work_board_events
   WHERE entity_id=d.id::text AND event_type='tradelink.document.approved')<>1
 THEN RAISE EXCEPTION 'Review ledger or approval Board audit is incomplete'; END IF;
 IF (SELECT count(*) FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=d.revision
    AND stage='primary' AND actor_id='119edeed-b85c-4349-9d89-11b323ca8509')<>1
  OR (SELECT count(*) FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=d.revision
    AND stage='secondary' AND actor_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')<>1
 THEN RAISE EXCEPTION 'Primary/secondary identity mapping failed'; END IF;
 RAISE NOTICE 'CP-TL-08H virtual secondary-review simulation PASS; production untouched';
END $postflight$;
