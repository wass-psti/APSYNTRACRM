-- CP-TL-08B: Preserve the existing revision-required edit path while routing
-- the saved revision back through the current For Approval / Draft selection.
-- This changes one predicate only; ownership, workspace, revision CAS, reviewer
-- validation, Board projection, audit, grants, and function security posture stay intact.
BEGIN;
DO $preflight$
DECLARE definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure)
 INTO definition;
 IF definition IS NULL
  OR position('workflow_state NOT IN (''draft'',''for-approval'')' IN definition)=0
  OR position('workflow_state NOT IN (''draft'',''for-approval'',''revision-required'')' IN definition)>0
 THEN RAISE EXCEPTION 'CP-TL-08B save-function baseline drift; no change applied'
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
  OR p_expected_revision<0 OR p_operation NOT IN ('create','update')
  OR p_operation IS NULL OR p_initial_state NOT IN ('draft','for-approval')
 THEN RAISE EXCEPTION 'Invalid TradeLink save command' USING ERRCODE='22023'; END IF;
 IF (p_operation='create' AND p_expected_revision<>0)
  OR (p_operation='update' AND p_expected_revision<1)
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
 IF d.id IS NULL OR d.board_id IS DISTINCT FROM p_board_id
  OR d.workspace_id IS DISTINCT FROM actor_workspace
  OR d.revision IS DISTINCT FROM p_expected_revision
  OR d.archived_at IS NOT NULL
  OR d.workflow_state NOT IN ('draft','for-approval','revision-required')
 THEN RAISE EXCEPTION 'TradeLink document is stale, archived, foreign, or not editable'
  USING ERRCODE='PT409'; END IF;
 IF payload->>'documentType' IS DISTINCT FROM d.document_type
 THEN RAISE EXCEPTION 'TradeLink document type cannot be changed' USING ERRCODE='42501'; END IF;
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
   'fromState',d.workflow_state,'toState',p_initial_state));
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
DECLARE f pg_catalog.pg_proc%rowtype; definition text;
BEGIN
 SELECT * INTO f FROM pg_catalog.pg_proc
  WHERE oid='private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure;
 definition:=pg_catalog.pg_get_functiondef(f.oid);
 IF f.oid IS NULL OR NOT f.prosecdef
  OR pg_catalog.pg_get_userbyid(f.proowner)<>'postgres'
  OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR position('workflow_state NOT IN (''draft'',''for-approval'',''revision-required'')' IN definition)=0
  OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
  OR has_function_privilege('anon',f.oid,'EXECUTE')
 THEN RAISE EXCEPTION 'CP-TL-08B save-function security or predicate postflight failed'
  USING ERRCODE='42501'; END IF;
END $postflight$;
COMMIT;
