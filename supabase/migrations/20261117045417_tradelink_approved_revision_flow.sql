-- CP-TL-REVISION-HISTORY-08: explicit approved-document supersession.
-- New business revision starts For Approval. Existing reviewer history and
-- immutable Approved snapshots remain untouched; no new roles or policies.
-- Activation requires separate production schema-change approval.
BEGIN;
DO $preflight$
DECLARE definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
 ) INTO definition;
 IF definition IS NULL
  OR position('p_operation NOT IN (''create'',''update'')' IN definition)=0
  OR position('d.workflow_state NOT IN (''draft'',''for-approval'',''revision-required'')' IN definition)=0
  OR to_regclass('private.tradelink_document_revision_snapshots') IS NULL
 THEN RAISE EXCEPTION 'TradeLink approved supersession preflight drift'
  USING ERRCODE='42501'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION private.tl03_save(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,
 p_operation text,p_data jsonb,p_initial_state text DEFAULT 'for-approval'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $save$
DECLARE
 actor uuid:=auth.uid(); actor_workspace uuid;
 d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;
 payload jsonb; group_id uuid; item_id uuid; rev bigint;
 modified_at timestamptz; target_state text;
 primary_email text; secondary_email text;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document manager required'
  USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL
  OR p_expected_revision<0 OR p_operation NOT IN ('create','update','revise-approved')
  OR p_operation IS NULL OR p_initial_state NOT IN ('draft','for-approval')
 THEN RAISE EXCEPTION 'Invalid TradeLink save command' USING ERRCODE='22023'; END IF;
 IF (p_operation='create' AND p_expected_revision<>0)
  OR (p_operation IN ('update','revise-approved') AND p_expected_revision<1)
 THEN RAISE EXCEPTION 'Invalid TradeLink expected revision' USING ERRCODE='22023'; END IF;
 payload:=private.tl03_validate_draft(p_data);
 actor_workspace:=public.current_workspace_id(actor);
 target_state:=p_initial_state;
 primary_email:=private.tl03_review_assignee(payload->>'documentType',payload,'primary');
 secondary_email:=private.tl03_review_assignee(payload->>'documentType',payload,'secondary');
 IF primary_email='' OR secondary_email='' OR primary_email=secondary_email
 THEN RAISE EXCEPTION 'Two different assigned TradeLink reviewers are required'
  USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
   WHERE pg_catalog.lower(pg_catalog.btrim(u.email))=primary_email
    AND u.email_confirmed_at IS NOT NULL AND p.status='active'
    AND public.current_workspace_id(u.id)=actor_workspace
    AND public.module_role_for('tradelink',u.id) IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
   WHERE pg_catalog.lower(pg_catalog.btrim(u.email))=secondary_email
    AND u.email_confirmed_at IS NOT NULL AND p.status='active'
    AND public.current_workspace_id(u.id)=actor_workspace
    AND public.module_role_for('tradelink',u.id) IS NOT NULL)
 THEN RAISE EXCEPTION 'Both assigned reviewers must be active confirmed TradeLink accounts in this workspace'
  USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM public.tradelink_documents WHERE id=p_document_id FOR UPDATE;
 IF p_operation='create' THEN
  IF d.id IS NOT NULL THEN
   IF d.board_id=p_board_id AND d.workspace_id=actor_workspace
    AND d.created_by=actor AND d.revision=1
    AND d.workflow_state=p_initial_state AND d.archived_at IS NULL
    AND d.content=payload
    AND EXISTS(SELECT 1 FROM public.work_board_items i
      WHERE i.id=d.board_item_id AND i.board_id=p_board_id
       AND i.title=d.document_number AND i.archived_at IS NULL)
   THEN RETURN pg_catalog.jsonb_build_object('documentId',d.id,
     'boardItemId',d.board_item_id,'revision',1,'state',d.workflow_state,
     'operation','create','idempotent',TRUE); END IF;
   RAISE EXCEPTION 'Existing TradeLink document ID conflict' USING ERRCODE='PT409';
  END IF;
  SELECT id INTO group_id FROM public.work_board_groups
   WHERE board_id=p_board_id ORDER BY position,id LIMIT 1;
  IF group_id IS NULL THEN RAISE EXCEPTION 'TradeLink main group missing'
   USING ERRCODE='42501'; END IF;
  item_id:=public.wm_add_board_item(p_board_id,group_id,payload->>'documentNumber');
  INSERT INTO public.tradelink_documents(
   id,board_id,workspace_id,board_item_id,document_type,document_number,
   workflow_state,revision,content,created_by,updated_by)
  VALUES(p_document_id,p_board_id,actor_workspace,item_id,
   payload->>'documentType',payload->>'documentNumber',p_initial_state,
   1,payload,actor,actor);
  rev:=1;modified_at:=pg_catalog.clock_timestamp();
  UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
   WHERE id=item_id AND board_id=p_board_id
    AND title=payload->>'documentNumber' AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board item creation projection mismatch'
   USING ERRCODE='PT409'; END IF;
  INSERT INTO public.tradelink_document_events(
   document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
  VALUES(p_document_id,p_board_id,actor_workspace,rev,'created',actor,
   pg_catalog.jsonb_build_object('documentType',payload->>'documentType',
    'workflowState',p_initial_state));
  PERFORM public.work_board_log(p_board_id,'tradelink.document.create',
   'TradeLink document saved','tradelink-document',p_document_id::text,
   pg_catalog.jsonb_build_object('revision',rev,'workflowState',p_initial_state));
  RETURN pg_catalog.jsonb_build_object('documentId',p_document_id,
   'boardItemId',item_id,'revision',rev,'state',p_initial_state,
   'operation','create','idempotent',FALSE);
 END IF;
 -- Retry only the immediately committed update from this same signed actor.
 -- The complete payload, state, audit actor/revision and Board projection must match.
 IF d.id IS NOT NULL
  AND d.board_id=p_board_id
  AND d.workspace_id=actor_workspace
  AND p_expected_revision<9223372036854775807
  AND d.revision=p_expected_revision+1
  AND d.archived_at IS NULL
  AND d.workflow_state=p_initial_state
  AND d.document_type=payload->>'documentType'
  AND d.content=payload
  AND EXISTS(
   SELECT 1 FROM public.tradelink_document_events e
   WHERE e.document_id=d.id AND e.board_id=p_board_id
    AND e.workspace_id=actor_workspace AND e.revision=d.revision
    AND e.operation='updated' AND e.actor_id=actor
    AND e.metadata->>'toState'=p_initial_state
    AND ((p_operation='revise-approved' AND e.metadata->>'fromState'='approved')
     OR (p_operation='update' AND e.metadata->>'fromState'<>'approved'))
  )
 THEN
  SELECT * INTO projection FROM public.work_board_items i
   WHERE i.id=d.board_item_id AND i.board_id=p_board_id FOR UPDATE;
  IF projection.id IS NOT NULL AND projection.archived_at IS NULL
   AND projection.title=d.document_number
   AND projection.updated_at>=d.updated_at
  THEN
   RETURN pg_catalog.jsonb_build_object('documentId',d.id,
    'boardItemId',d.board_item_id,'revision',d.revision,
    'state',d.workflow_state,'operation','update','idempotent',TRUE);
  END IF;
 END IF;
 IF d.id IS NULL OR d.board_id IS DISTINCT FROM p_board_id
  OR d.workspace_id IS DISTINCT FROM actor_workspace
  OR d.revision IS DISTINCT FROM p_expected_revision
  OR d.archived_at IS NOT NULL
  OR (p_operation='update' AND
    d.workflow_state NOT IN ('draft','for-approval','revision-required'))
  OR (p_operation='revise-approved' AND
    (d.workflow_state<>'approved' OR p_initial_state<>'for-approval'))
 THEN RAISE EXCEPTION 'TradeLink document is stale, archived, foreign, or not editable'
  USING ERRCODE='PT409'; END IF;
 IF payload->>'documentType' IS DISTINCT FROM d.document_type
 THEN RAISE EXCEPTION 'TradeLink document type cannot be changed' USING ERRCODE='42501'; END IF;
 IF p_operation='revise-approved' THEN
  -- Each historical Approved snapshot is immutable, current, and supported by
  -- two distinct signed approvals. An approved label alone is insufficient.
  IF NOT EXISTS(SELECT 1 FROM private.tradelink_document_revision_snapshots s
    WHERE s.document_id=d.id AND s.revision=d.revision
      AND s.content=d.content AND s.document_number=d.document_number
      AND s.board_id=d.board_id AND s.workspace_id=d.workspace_id
      AND s.board_item_id=d.board_item_id)
   OR (SELECT count(*) FILTER(WHERE r.stage='primary')=1
       AND count(*) FILTER(WHERE r.stage='secondary')=1
       AND count(DISTINCT r.actor_id)=2
       AND coalesce(bool_and(
         pg_catalog.lower(r.assigned_email)=pg_catalog.lower(u.email)
         AND r.assigned_email=private.tl03_review_assignee(d.document_type,d.content,r.stage)
       ),FALSE)
       FROM private.tradelink_document_reviews r
       LEFT JOIN auth.users u ON u.id=r.actor_id
       WHERE r.document_id=d.id AND r.document_revision=d.revision)
       IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'Approved historical revision audit is incomplete'
    USING ERRCODE='PT409'; END IF;
  IF payload->>'documentNumber' IS DISTINCT FROM d.document_number
   OR NOT (
     (payload->>'vendorId' IS NOT DISTINCT FROM d.content->>'vendorId'
       AND payload->>'templateId' IS NOT DISTINCT FROM d.content->>'templateId')
     OR (d.content->>'vendorId' IS NULL
       AND d.content->>'templateId' IS NULL
       AND payload->>'vendorId'='watchdog-sales'
       AND payload->>'templateId'='watchdog-sales-reference-v1')
   )
   OR payload->>'verifiedByEmail' IS DISTINCT FROM d.content->>'verifiedByEmail'
   OR payload->>'approvedByEmail' IS DISTINCT FROM d.content->>'approvedByEmail'
  THEN RAISE EXCEPTION 'Approved revision must preserve number, company and reviewers'
    USING ERRCODE='PT409'; END IF;
  IF payload=d.content THEN
   RAISE EXCEPTION 'An Approved revision requires an actual document change'
    USING ERRCODE='PT409';
  END IF;
 END IF;
 IF d.content=payload AND d.workflow_state=p_initial_state THEN
  RETURN pg_catalog.jsonb_build_object('documentId',d.id,
   'boardItemId',d.board_item_id,'revision',d.revision,
   'state',d.workflow_state,'operation','update','idempotent',TRUE);
 END IF;
 SELECT * INTO projection FROM public.work_board_items
  WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL
  OR projection.title IS DISTINCT FROM d.document_number
 THEN RAISE EXCEPTION 'TradeLink Board projection drift; reconcile before saving'
  USING ERRCODE='PT409'; END IF;
 IF payload->>'documentNumber' IS DISTINCT FROM d.document_number THEN
  PERFORM public.wm_set_board_cell_if_current(d.board_item_id,NULL,
   pg_catalog.to_jsonb(payload->>'documentNumber'),
   pg_catalog.to_jsonb(d.document_number));
 END IF;
 UPDATE public.tradelink_documents SET
  document_number=payload->>'documentNumber',content=payload,
  workflow_state=p_initial_state,revision=revision+1,
  updated_by=actor,updated_at=pg_catalog.clock_timestamp()
 WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
 UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
  WHERE id=d.board_item_id AND board_id=p_board_id
   AND title=payload->>'documentNumber' AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board projection changed during save'
  USING ERRCODE='PT409'; END IF;
 INSERT INTO public.tradelink_document_events(
  document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES(d.id,p_board_id,d.workspace_id,rev,'updated',actor,
  pg_catalog.jsonb_build_object('documentType',d.document_type,
   'fromState',d.workflow_state,'toState',p_initial_state,
   'revisionReason',CASE WHEN p_operation='revise-approved' THEN 'approved-supersession' ELSE NULL END));
 PERFORM public.work_board_log(p_board_id,'tradelink.document.update',
  'TradeLink document revision saved','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',rev,'workflowState',p_initial_state));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'revision',rev,'state',p_initial_state,
  'operation','update','idempotent',FALSE);
END $save$;
REVOKE ALL ON FUNCTION private.tl03_save(uuid,uuid,bigint,text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_save(uuid,uuid,bigint,text,jsonb,text)
 TO authenticated;
DO $postflight$
DECLARE definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
 ) INTO definition;
 IF position('approved-supersession' IN definition)=0
  OR position('Approved historical revision audit is incomplete' IN definition)=0
  OR NOT has_function_privilege('authenticated',
     'private.tl03_save(uuid,uuid,bigint,text,jsonb,text)','EXECUTE')
  OR has_function_privilege('anon',
     'private.tl03_save(uuid,uuid,bigint,text,jsonb,text)','EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink approved supersession postflight failed'
  USING ERRCODE='42501'; END IF;
END $postflight$;
COMMIT;
