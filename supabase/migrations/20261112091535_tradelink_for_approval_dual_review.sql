-- CP-TL-08: For Approval default, explicit Draft, independent assigned reviews.
-- Review capability is limited to the two accounts already assigned on each
-- document. It does not grant board management, edit, role, or permission changes.
-- PDF template generation is intentionally unchanged.
BEGIN;

DO $preflight$
DECLARE state_check text;
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.tradelink_document_events') IS NULL
  OR to_regclass('public.work_board_items') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('private.tl03_validate_draft(jsonb)') IS NULL
  OR to_regprocedure('private.tl03_deny_event_change()') IS NULL
  OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
  OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
  OR to_regprocedure('public.module_role_for(text,uuid)') IS NULL
  OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
  OR to_regprocedure('public.wm_add_board_item(uuid,uuid,text)') IS NULL
  OR to_regprocedure('public.wm_set_board_cell_if_current(uuid,uuid,jsonb,jsonb)') IS NULL
  OR to_regprocedure('public.work_board_log(uuid,text,text,text,text,jsonb)') IS NULL
  OR to_regprocedure('public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)') IS NOT NULL
  OR to_regprocedure('public.tl03_assigned_documents(uuid,integer)') IS NOT NULL
  OR to_regprocedure('public.tl03_document_read_assigned(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('public.tl03_record_review_stage(uuid,uuid,bigint,text)') IS NOT NULL
  OR to_regprocedure('public.tl03_document_status_update(uuid,uuid,bigint,text)') IS NOT NULL
  OR to_regclass('private.tradelink_document_reviews') IS NOT NULL
  OR to_regclass('private.tradelink_document_status_events') IS NOT NULL
 THEN RAISE EXCEPTION 'CP-TL-08 prerequisites or duplicate installation detected'
  USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.pg_get_constraintdef(c.oid) INTO state_check
 FROM pg_catalog.pg_constraint c
 WHERE c.conrelid='public.tradelink_documents'::regclass
  AND c.conname='tradelink_documents_workflow_state_check';
 IF state_check IS DISTINCT FROM
  'CHECK ((workflow_state = ANY (ARRAY[''draft''::text, ''submitted''::text, ''under-review''::text, ''revision-required''::text, ''approved''::text, ''rejected''::text, ''completed''::text, ''cancelled''::text])))'
 THEN RAISE EXCEPTION 'CP-TL-08 workflow state constraint drift'
  USING ERRCODE='42501'; END IF;
END $preflight$;

ALTER TABLE public.tradelink_documents
 DROP CONSTRAINT tradelink_documents_workflow_state_check;
ALTER TABLE public.tradelink_documents
 ADD CONSTRAINT tradelink_documents_workflow_state_check
 CHECK (workflow_state IN (
  'draft','for-approval','submitted','under-review','revision-required',
  'approved','rejected','completed','cancelled','under-negotiation',
  'expired','on-hold','won','lost','delivered','closed'
 ));

CREATE FUNCTION private.tl03_review_assignee(
 p_document_type text,p_content jsonb,p_stage text
) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $assignment$
 SELECT pg_catalog.lower(pg_catalog.btrim(coalesce(CASE p_document_type
  WHEN 'esi' THEN CASE p_stage WHEN 'primary' THEN p_content->>'verifiedBy'
   WHEN 'secondary' THEN p_content->>'approvedBy' END
  WHEN 'quotation' THEN CASE p_stage WHEN 'primary' THEN p_content->>'verifiedByEmail'
   WHEN 'secondary' THEN p_content->>'approvedByEmail' END
  WHEN 'po' THEN CASE p_stage WHEN 'primary' THEN p_content->>'verifiedBy'
   WHEN 'secondary' THEN p_content->>'approvedBy' END
  WHEN 'delivery' THEN CASE p_stage WHEN 'primary' THEN p_content->>'checkedBy'
   WHEN 'secondary' THEN p_content->>'deliveredBy' END
  WHEN 'payment' THEN CASE p_stage WHEN 'primary' THEN p_content->>'receivedBy'
   WHEN 'secondary' THEN p_content->>'verifiedBy' END
  WHEN 'packing' THEN CASE p_stage WHEN 'primary' THEN p_content->>'verifiedBy'
   WHEN 'secondary' THEN p_content->>'approvedBy' END
 END,'')))
$assignment$;
REVOKE ALL ON FUNCTION private.tl03_review_assignee(text,jsonb,text)
 FROM PUBLIC,anon,authenticated;

CREATE TABLE private.tradelink_document_reviews(
 review_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES public.tradelink_documents(id) ON DELETE RESTRICT,
 board_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 document_revision bigint NOT NULL CHECK(document_revision>=1),
 stage text NOT NULL CHECK(stage IN ('primary','secondary')),
 assigned_email text NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 CONSTRAINT tl03_review_stage_once UNIQUE(document_id,document_revision,stage),
 CONSTRAINT tl03_review_scope CHECK(
  board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND workspace_id='00000000-0000-4000-8000-000000000001'::uuid)
);
CREATE INDEX tl03_review_document_revision
 ON private.tradelink_document_reviews(document_id,document_revision,stage);
CREATE TRIGGER tl03_document_reviews_append_only
 BEFORE UPDATE OR DELETE ON private.tradelink_document_reviews
 FOR EACH ROW EXECUTE FUNCTION private.tl03_deny_event_change();
ALTER TABLE private.tradelink_document_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.tradelink_document_reviews FROM PUBLIC,anon,authenticated;

CREATE TABLE private.tradelink_document_status_events(
 event_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES public.tradelink_documents(id) ON DELETE RESTRICT,
 board_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 document_revision bigint NOT NULL CHECK(document_revision>=1),
 from_state text NOT NULL,
 to_state text NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 CONSTRAINT tl03_status_event_scope CHECK(
  board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND workspace_id='00000000-0000-4000-8000-000000000001'::uuid)
);
CREATE INDEX tl03_status_event_document
 ON private.tradelink_document_status_events(document_id,recorded_at DESC);
CREATE TRIGGER tl03_document_status_events_append_only
 BEFORE UPDATE OR DELETE ON private.tradelink_document_status_events
 FOR EACH ROW EXECUTE FUNCTION private.tl03_deny_event_change();
ALTER TABLE private.tradelink_document_status_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.tradelink_document_status_events FROM PUBLIC,anon,authenticated;

-- Existing active TradeLink module users with Board VIEW can validate only
-- documents on which their confirmed account email is explicitly assigned.
CREATE FUNCTION private.tl03_can_review(p_board_id uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $review_access$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR p_board_id IS DISTINCT FROM
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR NOT private.wm_board_config_session_active() THEN RETURN FALSE; END IF;
 RETURN coalesce(public.work_board_access(p_board_id,'view'),FALSE)
  AND public.module_role_for('tradelink',actor) IS NOT NULL
  AND EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
   JOIN public.work_boards b ON b.id=p_board_id
   WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL
    AND p.status='active' AND b.name='TradeLink' AND b.status='active'
    AND b.archived_at IS NULL AND b.trashed_at IS NULL
    AND b.workspace_id=public.current_workspace_id(actor)
    AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%');
END $review_access$;
REVOKE ALL ON FUNCTION private.tl03_can_review(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_can_review(uuid) TO authenticated;

-- The save RPC keeps document content and Board-item creation in one transaction.
-- A new record defaults to For Approval; only the explicit Draft dropdown choice
-- passes 'draft'. Existing Draft/For Approval documents remain editable.
CREATE FUNCTION private.tl03_save(
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
  OR d.workflow_state NOT IN ('draft','for-approval')
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

CREATE FUNCTION public.tl03_document_save(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,
 p_operation text,p_data jsonb,p_initial_state text DEFAULT 'for-approval'
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $save_rpc$
 SELECT private.tl03_save(p_board_id,p_document_id,p_expected_revision,
  p_operation,p_data,p_initial_state);
$save_rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)
 TO authenticated;

-- Post-approval statuses remain available without allowing a manual Approved
-- or For Approval transition. Cancellation is also available while pending.
CREATE FUNCTION private.tl03_update_document_status(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_target_state text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $status$
DECLARE actor uuid:=auth.uid(); actor_workspace uuid;
 d public.tradelink_documents%rowtype; projection public.work_board_items%rowtype;
 modified_at timestamptz;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document manager required' USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
  OR p_target_state IS NULL OR p_target_state NOT IN
   ('submitted','under-negotiation','expired','on-hold','won','lost','cancelled','delivered','closed')
 THEN RAISE EXCEPTION 'Invalid TradeLink status update' USING ERRCODE='22023'; END IF;
 actor_workspace:=public.current_workspace_id(actor);
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM actor_workspace
  OR d.revision IS DISTINCT FROM p_expected_revision OR d.archived_at IS NOT NULL
 THEN RAISE EXCEPTION 'TradeLink status target is stale, archived or foreign' USING ERRCODE='PT409'; END IF;
 IF d.workflow_state=p_target_state THEN
  RETURN pg_catalog.jsonb_build_object('documentId',d.id,'boardItemId',d.board_item_id,
   'revision',d.revision,'state',d.workflow_state,'updatedAt',d.updated_at,
   'idempotent',TRUE);
 END IF;
 IF p_target_state='cancelled' THEN
  IF d.workflow_state NOT IN ('draft','for-approval','approved','submitted',
   'under-negotiation','expired','on-hold','won','lost','delivered','closed')
  THEN RAISE EXCEPTION 'TradeLink status cannot be cancelled from this state' USING ERRCODE='PT409'; END IF;
 ELSE
  IF d.workflow_state NOT IN ('approved','submitted','under-negotiation',
   'expired','on-hold','won','lost','delivered','closed')
  THEN RAISE EXCEPTION 'Both assigned reviewers must approve before this status transition' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT * INTO projection FROM public.work_board_items
  WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL
  OR projection.title IS DISTINCT FROM d.document_number
 THEN RAISE EXCEPTION 'TradeLink Board projection changed' USING ERRCODE='PT409'; END IF;
 modified_at:=pg_catalog.clock_timestamp();
 UPDATE public.tradelink_documents SET workflow_state=p_target_state,
  updated_by=actor,updated_at=modified_at WHERE id=d.id;
 UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
  WHERE id=d.board_item_id AND board_id=p_board_id
   AND title=d.document_number AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board status projection changed'
  USING ERRCODE='PT409'; END IF;
 INSERT INTO private.tradelink_document_status_events(
  document_id,board_id,workspace_id,document_revision,from_state,to_state,actor_id)
 VALUES(d.id,p_board_id,d.workspace_id,d.revision,d.workflow_state,p_target_state,actor);
 PERFORM public.work_board_log(p_board_id,'tradelink.document.status-changed',
  'TradeLink document status changed','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',d.revision,
   'fromState',d.workflow_state,'toState',p_target_state));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'revision',d.revision,'state',p_target_state,
  'updatedAt',modified_at,'idempotent',FALSE);
END $status$;
REVOKE ALL ON FUNCTION private.tl03_update_document_status(uuid,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_update_document_status(uuid,uuid,bigint,text)
 TO authenticated;

CREATE FUNCTION public.tl03_document_status_update(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_target_state text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $status_rpc$
 SELECT private.tl03_update_document_status(
  p_board_id,p_document_id,p_expected_revision,p_target_state);
$status_rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_status_update(uuid,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_status_update(uuid,uuid,bigint,text)
 TO authenticated;

CREATE FUNCTION private.tl03_assigned_documents(
 p_board_id uuid,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $assigned$
DECLARE actor uuid:=auth.uid(); actor_email text; result jsonb;
BEGIN
 IF actor IS NULL OR private.tl03_can_review(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink reviewer session required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Invalid assigned document limit' USING ERRCODE='22023'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO actor_email
  FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL;
 WITH assigned AS (
  SELECT d.id,d.board_item_id,d.document_type,d.document_number,d.revision,
   d.workflow_state,d.archived_at,d.updated_at,
   private.tl03_review_assignee(d.document_type,d.content,'primary') primary_email,
   private.tl03_review_assignee(d.document_type,d.content,'secondary') secondary_email,
   primary_review.recorded_at primary_at,secondary_review.recorded_at secondary_at
  FROM public.tradelink_documents d
  LEFT JOIN private.tradelink_document_reviews primary_review
   ON primary_review.document_id=d.id AND primary_review.document_revision=d.revision
    AND primary_review.stage='primary'
  LEFT JOIN private.tradelink_document_reviews secondary_review
   ON secondary_review.document_id=d.id AND secondary_review.document_revision=d.revision
    AND secondary_review.stage='secondary'
  WHERE d.board_id=p_board_id
   AND d.workspace_id=public.current_workspace_id(actor)
   AND d.archived_at IS NULL
   AND actor_email IN (
    private.tl03_review_assignee(d.document_type,d.content,'primary'),
    private.tl03_review_assignee(d.document_type,d.content,'secondary'))
  ORDER BY d.updated_at DESC,d.id DESC LIMIT p_limit
 )
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'documentId',a.id,'boardItemId',a.board_item_id,
  'documentType',a.document_type,'documentNumber',a.document_number,
  'revision',a.revision,'workflowState',a.workflow_state,
  'archived',a.archived_at IS NOT NULL,'updatedAt',a.updated_at,
  'primaryEmail',a.primary_email,'secondaryEmail',a.secondary_email,
  'primaryAt',a.primary_at,'secondaryAt',a.secondary_at,
  'assignedStage',CASE WHEN actor_email=a.primary_email THEN 'primary'
   WHEN actor_email=a.secondary_email THEN 'secondary' ELSE NULL END
 ) ORDER BY a.updated_at DESC,a.id DESC),'[]'::jsonb) INTO result FROM assigned a;
 RETURN result;
END $assigned$;
REVOKE ALL ON FUNCTION private.tl03_assigned_documents(uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_assigned_documents(uuid,integer)
 TO authenticated;

CREATE FUNCTION public.tl03_assigned_documents(
 p_board_id uuid,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $assigned_rpc$
 SELECT private.tl03_assigned_documents(p_board_id,p_limit);
$assigned_rpc$;
REVOKE ALL ON FUNCTION public.tl03_assigned_documents(uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_assigned_documents(uuid,integer)
 TO authenticated;

CREATE FUNCTION private.tl03_document_read_assigned(
 p_board_id uuid,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $read_assigned$
DECLARE actor uuid:=auth.uid(); actor_email text; d public.tradelink_documents%rowtype;
BEGIN
 IF actor IS NULL OR private.tl03_can_review(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink reviewer session required' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO actor_email
  FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL;
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
  OR d.archived_at IS NOT NULL
  OR actor_email NOT IN (
   private.tl03_review_assignee(d.document_type,d.content,'primary'),
   private.tl03_review_assignee(d.document_type,d.content,'secondary'))
 THEN RAISE EXCEPTION 'Document is not assigned to this signed account'
  USING ERRCODE='42501'; END IF;
 RETURN pg_catalog.to_jsonb(d);
END $read_assigned$;
REVOKE ALL ON FUNCTION private.tl03_document_read_assigned(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_document_read_assigned(uuid,uuid)
 TO authenticated;

CREATE FUNCTION public.tl03_document_read_assigned(
 p_board_id uuid,p_document_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $read_assigned_rpc$
 SELECT private.tl03_document_read_assigned(p_board_id,p_document_id);
$read_assigned_rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_read_assigned(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_read_assigned(uuid,uuid)
 TO authenticated;

CREATE FUNCTION private.tl03_document_review_stages(
 p_board_id uuid,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $stages$
DECLARE actor uuid:=auth.uid(); actor_email text; d public.tradelink_documents%rowtype;
 primary_row private.tradelink_document_reviews%rowtype;
 secondary_row private.tradelink_document_reviews%rowtype;
BEGIN
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'TradeLink document not found' USING ERRCODE='PT404'; END IF;
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  IF private.tl03_can_review(p_board_id) IS DISTINCT FROM TRUE THEN
   RAISE EXCEPTION 'Signed TradeLink reviewer session required' USING ERRCODE='42501'; END IF;
  SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO actor_email
   FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL;
  IF actor_email NOT IN (
   private.tl03_review_assignee(d.document_type,d.content,'primary'),
   private.tl03_review_assignee(d.document_type,d.content,'secondary')) THEN
   RAISE EXCEPTION 'Document is not assigned to this account' USING ERRCODE='42501'; END IF;
 END IF;
 IF d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor) THEN
  RAISE EXCEPTION 'Foreign TradeLink document' USING ERRCODE='42501'; END IF;
 SELECT * INTO primary_row FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=d.revision AND stage='primary';
 SELECT * INTO secondary_row FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=d.revision AND stage='secondary';
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,'revision',d.revision,
  'state',d.workflow_state,
  'primary',CASE WHEN primary_row.review_id IS NULL THEN NULL ELSE
   pg_catalog.jsonb_build_object('actorId',primary_row.actor_id,
    'assignedEmail',primary_row.assigned_email,'recordedAt',primary_row.recorded_at) END,
  'secondary',CASE WHEN secondary_row.review_id IS NULL THEN NULL ELSE
   pg_catalog.jsonb_build_object('actorId',secondary_row.actor_id,
    'assignedEmail',secondary_row.assigned_email,'recordedAt',secondary_row.recorded_at) END);
END $stages$;
REVOKE ALL ON FUNCTION private.tl03_document_review_stages(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_document_review_stages(uuid,uuid)
 TO authenticated;

CREATE FUNCTION public.tl03_document_review_stages(
 p_board_id uuid,p_document_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $stages_rpc$
 SELECT private.tl03_document_review_stages(p_board_id,p_document_id);
$stages_rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_review_stages(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_review_stages(uuid,uuid)
 TO authenticated;

-- Both reviewers are independent. Either can act first; the second valid
-- review automatically changes For Approval to Approved in the same transaction.
CREATE FUNCTION private.tl03_record_review_stage(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_stage text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $record_review$
DECLARE
 actor uuid:=auth.uid(); actor_email text; nominated text;
 d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;
 event_row private.tradelink_document_reviews%rowtype;
 inserted boolean:=FALSE; review_count integer; primary_at timestamptz;
 secondary_at timestamptz; modified_at timestamptz; target_state text;
BEGIN
 IF actor IS NULL OR private.tl03_can_review(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink reviewer session required' USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
  OR p_stage NOT IN ('primary','secondary') OR p_stage IS NULL
 THEN RAISE EXCEPTION 'Invalid TradeLink review stage command' USING ERRCODE='22023'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO actor_email
  FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL;
 IF actor_email IS NULL OR actor_email='' THEN
  RAISE EXCEPTION 'Confirmed reviewer account required' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
  OR d.revision IS DISTINCT FROM p_expected_revision OR d.archived_at IS NOT NULL
  OR d.workflow_state NOT IN ('for-approval','approved')
 THEN RAISE EXCEPTION 'Stale, archived, or non-pending TradeLink document'
  USING ERRCODE='PT409'; END IF;
 nominated:=private.tl03_review_assignee(d.document_type,d.content,p_stage);
 IF nominated='' OR nominated IS DISTINCT FROM actor_email
 THEN RAISE EXCEPTION 'Only the assigned reviewer account can record this stage'
  USING ERRCODE='42501'; END IF;
 IF private.tl03_review_assignee(d.document_type,d.content,'primary')=
    private.tl03_review_assignee(d.document_type,d.content,'secondary')
 THEN RAISE EXCEPTION 'Two distinct assigned reviewers are required'
  USING ERRCODE='PT409'; END IF;
 SELECT * INTO projection FROM public.work_board_items
  WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL
  OR projection.title IS DISTINCT FROM d.document_number
 THEN RAISE EXCEPTION 'TradeLink Board projection changed' USING ERRCODE='PT409'; END IF;
 INSERT INTO private.tradelink_document_reviews(
  document_id,board_id,workspace_id,document_revision,stage,
  assigned_email,actor_id)
 VALUES(d.id,p_board_id,d.workspace_id,d.revision,p_stage,nominated,actor)
 ON CONFLICT(document_id,document_revision,stage) DO NOTHING
 RETURNING * INTO event_row;
 inserted:=FOUND;
 IF NOT inserted THEN
  SELECT * INTO event_row FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=d.revision AND stage=p_stage;
  IF event_row.actor_id IS DISTINCT FROM actor OR
    event_row.assigned_email IS DISTINCT FROM nominated
  THEN RAISE EXCEPTION 'This review stage was already recorded by its assigned account'
   USING ERRCODE='PT409'; END IF;
  SELECT recorded_at INTO primary_at FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=d.revision AND stage='primary';
  SELECT recorded_at INTO secondary_at FROM private.tradelink_document_reviews
   WHERE document_id=d.id AND document_revision=d.revision AND stage='secondary';
  RETURN pg_catalog.jsonb_build_object('documentId',d.id,
   'boardItemId',d.board_item_id,'revision',d.revision,'stage',p_stage,
   'recordedAt',event_row.recorded_at,'primaryAt',primary_at,
   'secondaryAt',secondary_at,'state',d.workflow_state,'idempotent',TRUE);
 END IF;
 IF d.workflow_state='approved' THEN
  RAISE EXCEPTION 'Approved TradeLink document is missing its review event'
   USING ERRCODE='PT409'; END IF;
 SELECT count(*)::integer INTO review_count
  FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=d.revision;
 SELECT recorded_at INTO primary_at FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=d.revision AND stage='primary';
 SELECT recorded_at INTO secondary_at FROM private.tradelink_document_reviews
  WHERE document_id=d.id AND document_revision=d.revision AND stage='secondary';
 modified_at:=pg_catalog.clock_timestamp();
 target_state:=CASE WHEN review_count=2 THEN 'approved' ELSE 'for-approval' END;
 UPDATE public.tradelink_documents SET
  workflow_state=target_state,updated_by=actor,updated_at=modified_at
 WHERE id=d.id;
 UPDATE public.work_board_items SET updated_by=actor,updated_at=modified_at
  WHERE id=d.board_item_id AND board_id=p_board_id
   AND title=d.document_number AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board review projection changed'
  USING ERRCODE='PT409'; END IF;
 PERFORM public.work_board_log(p_board_id,
  CASE WHEN target_state='approved' THEN 'tradelink.document.approved' ELSE
   'tradelink.document.reviewed.'||p_stage END,
  CASE WHEN target_state='approved' THEN 'TradeLink document approved after both reviews' ELSE
   'TradeLink assigned reviewer validated document' END,
  'tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',d.revision,'stage',p_stage,
   'workflowState',target_state,'primaryAt',primary_at,'secondaryAt',secondary_at));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'revision',d.revision,'stage',p_stage,
  'recordedAt',event_row.recorded_at,'primaryAt',primary_at,
  'secondaryAt',secondary_at,'state',target_state,'idempotent',NOT inserted);
END $record_review$;
REVOKE ALL ON FUNCTION private.tl03_record_review_stage(uuid,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_record_review_stage(uuid,uuid,bigint,text)
 TO authenticated;

CREATE FUNCTION public.tl03_record_review_stage(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_stage text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $record_review_rpc$
 SELECT private.tl03_record_review_stage(
  p_board_id,p_document_id,p_expected_revision,p_stage);
$record_review_rpc$;
REVOKE ALL ON FUNCTION public.tl03_record_review_stage(uuid,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_record_review_stage(uuid,uuid,bigint,text)
 TO authenticated;

-- Update the existing signed search allowlist without changing its scope,
-- ordering, paging, or returned document content boundary.
CREATE OR REPLACE FUNCTION public.tl03_documents_page(
 p_board_id uuid,p_search text DEFAULT '',p_document_type text DEFAULT 'all',
 p_workflow_state text DEFAULT 'all',p_archive_mode text DEFAULT 'active',
 p_before_at timestamp with time zone DEFAULT NULL,
 p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $page$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink manager access required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
  OR p_search IS NULL OR pg_catalog.char_length(p_search)>120
  OR p_document_type IS NULL OR p_document_type NOT IN
   ('all','esi','packing','delivery','payment','quotation','po')
  OR p_workflow_state IS NULL OR p_workflow_state NOT IN
   ('all','draft','for-approval','submitted','under-review','revision-required',
    'approved','rejected','completed','cancelled','under-negotiation',
    'expired','on-hold','won','lost','delivered','closed')
  OR p_archive_mode IS NULL OR p_archive_mode NOT IN ('all','active','archived')
  OR ((p_before_at IS NULL)<>(p_before_id IS NULL))
 THEN RAISE EXCEPTION 'Invalid bounded TradeLink search parameters' USING ERRCODE='22023'; END IF;
 WITH limited AS MATERIALIZED (
  SELECT d.id,d.board_item_id,d.document_type,d.document_number,d.revision,
   d.workflow_state,d.archived_at,d.updated_at
  FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id
   AND d.workspace_id=public.current_workspace_id(auth.uid())
   AND (p_search='' OR pg_catalog.strpos(pg_catalog.lower(d.document_number),
    pg_catalog.lower(p_search))>0)
   AND (p_document_type='all' OR d.document_type=p_document_type)
   AND (p_workflow_state='all' OR d.workflow_state=p_workflow_state)
   AND (p_archive_mode='all' OR
    (p_archive_mode='active' AND d.archived_at IS NULL) OR
    (p_archive_mode='archived' AND d.archived_at IS NOT NULL))
   AND (p_before_at IS NULL OR (d.updated_at,d.id)<(p_before_at,p_before_id))
  ORDER BY d.updated_at DESC,d.id DESC LIMIT (p_limit+1)
 ), ranked AS (
  SELECT l.*,pg_catalog.row_number() OVER (ORDER BY l.updated_at DESC,l.id DESC) rn
  FROM limited l
 )
 SELECT pg_catalog.jsonb_build_object(
  'rows',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'documentId',r.id,'boardItemId',r.board_item_id,
   'documentType',r.document_type,'documentNumber',r.document_number,
   'revision',r.revision,'workflowState',r.workflow_state,
   'archived',r.archived_at IS NOT NULL,'updatedAt',r.updated_at)
   ORDER BY r.updated_at DESC,r.id DESC) FILTER(WHERE r.rn<=p_limit),'[]'::jsonb),
  'hasMore',pg_catalog.count(*)>p_limit,
  'nextCursor',CASE WHEN pg_catalog.count(*)>p_limit THEN
   (SELECT pg_catalog.jsonb_build_object('updatedAt',last.updated_at,'documentId',last.id)
    FROM ranked last WHERE last.rn=p_limit) ELSE NULL END
 ) INTO result FROM ranked r;
 RETURN result;
END $page$;

DO $postflight$
DECLARE f pg_catalog.pg_proc%rowtype;
BEGIN
 SELECT * INTO f FROM pg_catalog.pg_proc
  WHERE oid='private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure;
 IF f.oid IS NULL OR NOT f.prosecdef
  OR pg_catalog.pg_get_userbyid(f.proowner)<>'postgres'
  OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
   p.oid='private.tl03_record_review_stage(uuid,uuid,bigint,text)'::regprocedure
    AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
   p.oid='private.tl03_update_document_status(uuid,uuid,bigint,text)'::regprocedure
    AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
   p.oid='private.tl03_document_read_assigned(uuid,uuid)'::regprocedure
    AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
  OR NOT has_function_privilege('authenticated',
   'public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_record_review_stage(uuid,uuid,bigint,text)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_record_review_stage(uuid,uuid,bigint,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_assigned_documents(uuid,integer)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_assigned_documents(uuid,integer)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_document_read_assigned(uuid,uuid)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_document_read_assigned(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_document_status_update(uuid,uuid,bigint,text)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_document_status_update(uuid,uuid,bigint,text)','EXECUTE')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
   p.oid='public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
    AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
   p.oid='public.tl03_document_status_update(uuid,uuid,bigint,text)'::regprocedure
    AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
 THEN RAISE EXCEPTION 'CP-TL-08 function posture or grant drift'
  USING ERRCODE='42501'; END IF;
END $postflight$;

COMMIT;
