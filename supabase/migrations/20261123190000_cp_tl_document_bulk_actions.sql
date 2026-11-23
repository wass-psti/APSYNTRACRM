-- CP-TL-DOCUMENT-BULK-ACTIONS-01
-- Reuse the existing All Documents selection with atomic export-adjacent
-- hide/unhide and terminal delete actions. Preserve immutable document history.
BEGIN;

DO $preflight$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.tradelink_document_events') IS NULL
  OR to_regclass('private.tradelink_document_reviews') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
  OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
  OR to_regprocedure('public.wm_set_board_item_archived(uuid,boolean)') IS NULL
  OR to_regprocedure('public.work_board_log(uuid,text,text,text,text,jsonb)') IS NULL
  OR to_regprocedure('private.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)') IS NULL
  OR to_regprocedure('public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)') IS NULL
  OR to_regprocedure('public.tl03_documents_bulk_action(uuid,text,jsonb)') IS NOT NULL
  OR to_regprocedure('private.tl03_documents_bulk_action(uuid,text,jsonb)') IS NOT NULL
  OR EXISTS (
   SELECT 1 FROM pg_catalog.pg_attribute
   WHERE attrelid='public.tradelink_documents'::regclass
    AND attname IN ('hidden_at','hidden_by','deleted_at','deleted_by')
    AND NOT attisdropped
  )
 THEN RAISE EXCEPTION 'CP-TL bulk-action prerequisites or duplicate installation detected'
  USING ERRCODE='55000'; END IF;
END $preflight$;

ALTER TABLE public.tradelink_documents
 ADD COLUMN hidden_at timestamptz,
 ADD COLUMN hidden_by uuid REFERENCES auth.users(id),
 ADD COLUMN deleted_at timestamptz,
 ADD COLUMN deleted_by uuid REFERENCES auth.users(id),
 ADD CONSTRAINT tl03_document_hidden_actor_pair
  CHECK ((hidden_at IS NULL)=(hidden_by IS NULL)),
 ADD CONSTRAINT tl03_document_deleted_actor_pair
  CHECK ((deleted_at IS NULL)=(deleted_by IS NULL)),
 ADD CONSTRAINT tl03_document_deleted_not_hidden
  CHECK (deleted_at IS NULL OR (hidden_at IS NULL AND hidden_by IS NULL));

CREATE INDEX tl03_document_hidden_created
 ON public.tradelink_documents(board_id,created_at DESC,id DESC)
 WHERE hidden_at IS NOT NULL AND deleted_at IS NULL;

-- Visibility metadata must never rewrite business content or a document revision.
-- A terminal delete is a tombstone: immutable event, review and revision records
-- remain attached and auditable because their existing foreign keys are RESTRICT.
CREATE FUNCTION private.tl03_guard_document_visibility()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
BEGIN
 IF OLD.deleted_at IS NOT NULL THEN
  RAISE EXCEPTION 'Deleted TradeLink documents are terminal'
   USING ERRCODE='PT410';
 END IF;

 IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
  IF NEW.deleted_at IS NULL OR NEW.deleted_by IS NULL
   OR NEW.hidden_at IS NOT NULL OR NEW.hidden_by IS NOT NULL
   OR (pg_catalog.to_jsonb(NEW)-ARRAY['hidden_at','hidden_by','deleted_at','deleted_by'])
      IS DISTINCT FROM
      (pg_catalog.to_jsonb(OLD)-ARRAY['hidden_at','hidden_by','deleted_at','deleted_by'])
  THEN RAISE EXCEPTION 'TradeLink delete must only set terminal visibility metadata'
   USING ERRCODE='PT410'; END IF;
  RETURN NEW;
 END IF;

 IF NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
  RAISE EXCEPTION 'TradeLink delete actor cannot change' USING ERRCODE='PT410';
 END IF;

 IF NEW.hidden_at IS DISTINCT FROM OLD.hidden_at
  OR NEW.hidden_by IS DISTINCT FROM OLD.hidden_by THEN
  IF (NEW.hidden_at IS NULL) IS DISTINCT FROM (NEW.hidden_by IS NULL)
   OR (pg_catalog.to_jsonb(NEW)-ARRAY['hidden_at','hidden_by'])
      IS DISTINCT FROM
      (pg_catalog.to_jsonb(OLD)-ARRAY['hidden_at','hidden_by'])
  THEN RAISE EXCEPTION 'TradeLink hide must not change document content or revision'
   USING ERRCODE='PT410'; END IF;
 END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION private.tl03_guard_document_visibility() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tl03_document_visibility_guard
 BEFORE UPDATE ON public.tradelink_documents
 FOR EACH ROW EXECUTE FUNCTION private.tl03_guard_document_visibility();

-- Read-only compatibility list: normal list calls exclude hidden and deleted rows.
CREATE OR REPLACE FUNCTION public.tl03_documents_list(
 p_board_id uuid,p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $list$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  AND private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document list denied' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Invalid list limit' USING ERRCODE='22023'; END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'documentId',s.id,'boardItemId',s.board_item_id,
  'documentType',s.document_type,'documentNumber',s.document_number,
  'clientName',s.content->>'customerName',
  'revision',s.revision,'workflowState',s.workflow_state,
  'archived',s.archived_at IS NOT NULL,'hidden',false,
  'createdAt',s.created_at,'updatedAt',s.updated_at,
  'createdByActor',s.created_by=auth.uid()
 ) ORDER BY s.created_at DESC,s.id DESC),'[]'::jsonb)
 INTO result
 FROM (
  SELECT d.id,d.board_item_id,d.document_type,d.document_number,d.content,
   d.revision,d.workflow_state,d.archived_at,d.created_at,d.updated_at,d.created_by
  FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id
   AND d.workspace_id=public.current_workspace_id(auth.uid())
   AND d.hidden_at IS NULL AND d.deleted_at IS NULL
   AND (private.tl03_can_manage(p_board_id) IS TRUE OR d.created_by=auth.uid())
  ORDER BY d.created_at DESC,d.id DESC LIMIT p_limit
 ) s;
 RETURN result;
END $list$;

-- New page contract adds visibilityMode while retaining the existing 8-argument
-- wrapper below for callers that have not yet moved to the new client.
CREATE FUNCTION private.tl03_documents_page(
 p_board_id uuid,p_search text,p_document_type text,p_workflow_state text,
 p_archive_mode text,p_visibility_mode text,
 p_before_at timestamptz,p_before_id uuid,p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $page$
DECLARE
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_actor_email text;
 v_can_manage boolean;
 v_can_create boolean;
 v_can_review boolean;
 result jsonb;
BEGIN
 IF v_actor IS NULL
  OR p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR private.wm_board_config_session_active() IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document session required' USING ERRCODE='42501'; END IF;

 v_workspace:=public.current_workspace_id(v_actor);
 v_can_manage:=coalesce(private.tl03_can_manage(p_board_id),false);
 v_can_create:=coalesce(private.tl03_can_create_draft(p_board_id),false);
 v_can_review:=coalesce(private.tl03_can_review(p_board_id),false);
 IF v_workspace IS NULL OR NOT (v_can_manage OR v_can_create OR v_can_review) THEN
  RAISE EXCEPTION 'Signed TradeLink document read denied' USING ERRCODE='42501'; END IF;

 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
  OR p_search IS NULL OR pg_catalog.char_length(p_search)>120
  OR p_document_type IS NULL OR p_document_type NOT IN
   ('all','esi','packing','delivery','payment','quotation','po')
  OR p_workflow_state IS NULL OR p_workflow_state NOT IN
   ('all','draft','for-approval','submitted','under-review','revision-required',
    'approved','rejected','completed','cancelled','under-negotiation',
    'expired','on-hold','won','lost','delivered','closed')
  OR p_archive_mode IS NULL OR p_archive_mode NOT IN ('all','active','archived')
  OR p_visibility_mode IS NULL OR p_visibility_mode NOT IN ('all','visible','hidden')
  OR ((p_before_at IS NULL)<>(p_before_id IS NULL))
 THEN RAISE EXCEPTION 'Invalid bounded TradeLink search parameters' USING ERRCODE='22023'; END IF;

 IF v_can_review THEN
  SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO v_actor_email
  FROM auth.users u WHERE u.id=v_actor AND u.email_confirmed_at IS NOT NULL;
 END IF;

 WITH eligible AS MATERIALIZED (
  SELECT d.id,d.board_item_id,d.document_type,d.document_number,d.content,
   d.revision,d.workflow_state,d.archived_at,d.hidden_at,d.created_at,d.updated_at,
   d.created_by,
   private.tl03_review_assignee(d.document_type,d.content,'primary') primary_email,
   private.tl03_review_assignee(d.document_type,d.content,'secondary') secondary_email
  FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id AND d.workspace_id=v_workspace
   AND d.deleted_at IS NULL
   AND (v_can_manage OR d.hidden_at IS NULL)
   AND (p_visibility_mode='all'
    OR (p_visibility_mode='visible' AND d.hidden_at IS NULL)
    OR (p_visibility_mode='hidden' AND d.hidden_at IS NOT NULL))
   AND (
    v_can_manage
    OR (v_can_create AND d.created_by=v_actor)
    OR (v_can_review AND d.archived_at IS NULL AND v_actor_email IS NOT NULL
     AND v_actor_email IN (
      private.tl03_review_assignee(d.document_type,d.content,'primary'),
      private.tl03_review_assignee(d.document_type,d.content,'secondary')
     ))
   )
   AND (p_search='' OR pg_catalog.strpos(
    pg_catalog.lower(d.document_number),pg_catalog.lower(p_search))>0)
   AND (p_document_type='all' OR d.document_type=p_document_type)
   AND (p_workflow_state='all' OR d.workflow_state=p_workflow_state)
   AND (p_archive_mode='all'
    OR (p_archive_mode='active' AND d.archived_at IS NULL)
    OR (p_archive_mode='archived' AND d.archived_at IS NOT NULL))
   AND (p_before_at IS NULL OR (d.created_at,d.id)<(p_before_at,p_before_id))
  ORDER BY d.created_at DESC,d.id DESC LIMIT (p_limit+1)
 ), ranked AS (
  SELECT e.*,pg_catalog.row_number() OVER(ORDER BY e.created_at DESC,e.id DESC) rn
  FROM eligible e
 )
 SELECT pg_catalog.jsonb_build_object(
  'rows',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'documentId',r.id,'boardItemId',r.board_item_id,
   'documentType',r.document_type,'documentNumber',r.document_number,
   'clientName',r.content->>'customerName',
   'revision',r.revision,'workflowState',r.workflow_state,
   'archived',r.archived_at IS NOT NULL,'hidden',r.hidden_at IS NOT NULL,
   'createdAt',r.created_at,'updatedAt',r.updated_at,
   'createdByActor',r.created_by=v_actor,
   'assignedStage',CASE
    WHEN v_can_review AND v_actor_email=r.primary_email THEN 'primary'
    WHEN v_can_review AND v_actor_email=r.secondary_email THEN 'secondary'
    ELSE NULL END,
   'primaryAt',CASE WHEN v_can_review AND v_actor_email IN
    (r.primary_email,r.secondary_email) THEN primary_review.recorded_at ELSE NULL END,
   'secondaryAt',CASE WHEN v_can_review AND v_actor_email IN
    (r.primary_email,r.secondary_email) THEN secondary_review.recorded_at ELSE NULL END
  ) ORDER BY r.created_at DESC,r.id DESC)
   FILTER(WHERE r.rn<=p_limit),'[]'::jsonb),
  'hasMore',pg_catalog.count(*)>p_limit,
  'nextCursor',CASE WHEN pg_catalog.count(*)>p_limit THEN
   (SELECT pg_catalog.jsonb_build_object(
     'createdAt',last.created_at,'documentId',last.id)
    FROM ranked last WHERE last.rn=p_limit)
   ELSE NULL END
 ) INTO result
 FROM ranked r
 LEFT JOIN private.tradelink_document_reviews primary_review
  ON primary_review.document_id=r.id
  AND primary_review.document_revision=r.revision AND primary_review.stage='primary'
 LEFT JOIN private.tradelink_document_reviews secondary_review
  ON secondary_review.document_id=r.id
  AND secondary_review.document_revision=r.revision AND secondary_review.stage='secondary';
 RETURN result;
END $page$;
REVOKE ALL ON FUNCTION private.tl03_documents_page(
 uuid,text,text,text,text,text,timestamptz,uuid,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_documents_page(
 uuid,text,text,text,text,text,timestamptz,uuid,integer
) TO authenticated;

-- Keep the old private and public page signatures as visible-only wrappers.
CREATE OR REPLACE FUNCTION private.tl03_documents_page(
 p_board_id uuid,p_search text DEFAULT '',
 p_document_type text DEFAULT 'all',p_workflow_state text DEFAULT 'all',
 p_archive_mode text DEFAULT 'active',p_before_at timestamptz DEFAULT NULL,
 p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $legacy_page$
 SELECT private.tl03_documents_page(p_board_id,p_search,p_document_type,
  p_workflow_state,p_archive_mode,'visible',p_before_at,p_before_id,p_limit);
$legacy_page$;
REVOKE ALL ON FUNCTION private.tl03_documents_page(
 uuid,text,text,text,text,timestamptz,uuid,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_documents_page(
 uuid,text,text,text,text,timestamptz,uuid,integer
) TO authenticated;

CREATE FUNCTION public.tl03_documents_page(
 p_board_id uuid,p_search text,p_document_type text,p_workflow_state text,
 p_archive_mode text,p_visibility_mode text,
 p_before_at timestamptz,p_before_id uuid,p_limit integer
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $page_rpc$
 SELECT private.tl03_documents_page(p_board_id,p_search,p_document_type,
  p_workflow_state,p_archive_mode,p_visibility_mode,p_before_at,p_before_id,p_limit);
$page_rpc$;
REVOKE ALL ON FUNCTION public.tl03_documents_page(
 uuid,text,text,text,text,text,timestamptz,uuid,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_documents_page(
 uuid,text,text,text,text,text,timestamptz,uuid,integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.tl03_documents_page(
 p_board_id uuid,p_search text DEFAULT '',
 p_document_type text DEFAULT 'all',p_workflow_state text DEFAULT 'all',
 p_archive_mode text DEFAULT 'active',p_before_at timestamptz DEFAULT NULL,
 p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $legacy_page_rpc$
 SELECT private.tl03_documents_page(p_board_id,p_search,p_document_type,
  p_workflow_state,p_archive_mode,'visible',p_before_at,p_before_id,p_limit);
$legacy_page_rpc$;
REVOKE ALL ON FUNCTION public.tl03_documents_page(
 uuid,text,text,text,text,timestamptz,uuid,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_documents_page(
 uuid,text,text,text,text,timestamptz,uuid,integer
) TO authenticated;

-- A terminally deleted record must no longer appear in the separate assigned
-- reviewer inbox or open through a stale reviewer link. Existing audit history
-- remains available through the manager revision-history path.
CREATE OR REPLACE FUNCTION private.tl03_assigned_documents(
 p_board_id uuid,p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $assigned$
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
   AND d.archived_at IS NULL AND d.deleted_at IS NULL
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

CREATE OR REPLACE FUNCTION private.tl03_document_read_assigned(
 p_board_id uuid,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $read_assigned$
DECLARE actor uuid:=auth.uid(); actor_email text; d public.tradelink_documents%rowtype;
BEGIN
 IF actor IS NULL OR private.tl03_can_review(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink reviewer session required' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(email)) INTO actor_email
  FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL;
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id AND deleted_at IS NULL;
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

-- A reviewer action can insert its stage row before updating the document.
-- Reject that insert for a terminally deleted document as well.
CREATE FUNCTION private.tl03_guard_deleted_document_review()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $review_guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.tradelink_documents d
  WHERE d.id=NEW.document_id AND d.deleted_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Deleted TradeLink documents cannot receive new review stages'
   USING ERRCODE='PT410';
 END IF;
 RETURN NEW;
END $review_guard$;
REVOKE ALL ON FUNCTION private.tl03_guard_deleted_document_review()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER tl03_review_reject_deleted_document
 BEFORE INSERT ON private.tradelink_document_reviews
 FOR EACH ROW EXECUTE FUNCTION private.tl03_guard_deleted_document_review();

CREATE FUNCTION private.tl03_documents_bulk_action(
 p_board_id uuid,p_action text,p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $bulk$
DECLARE
 actor uuid:=auth.uid();
 actor_workspace uuid;
 entry jsonb;
 record_id uuid;
 expected_revision bigint;
 ids uuid[]:=ARRAY[]::uuid[];
 revisions bigint[]:=ARRAY[]::bigint[];
 doc public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;
 idx integer;
 total integer;
 changed_at timestamptz:=pg_catalog.clock_timestamp();
 result_rows jsonb;
BEGIN
 IF actor IS NULL OR p_board_id IS DISTINCT FROM
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink manager required' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('hide','unhide','delete')
  OR pg_catalog.jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
  OR pg_catalog.jsonb_array_length(p_rows) NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'Select between 1 and 50 TradeLink documents' USING ERRCODE='22023'; END IF;
 actor_workspace:=public.current_workspace_id(actor);
 IF actor_workspace IS NULL THEN RAISE EXCEPTION 'TradeLink workspace unavailable' USING ERRCODE='42501'; END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_board_id::text,0));
 FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows)
 LOOP
  IF pg_catalog.jsonb_typeof(entry) IS DISTINCT FROM 'object'
   OR NOT (entry ? 'id') OR NOT (entry ? 'revision')
   OR entry-'id'-'revision'<>'{}'::jsonb
   OR entry->>'id' IS NULL OR entry->>'revision' IS NULL
   OR entry->>'revision' !~ '^[1-9][0-9]*$'
  THEN RAISE EXCEPTION 'Each selected document requires an ID and revision'
   USING ERRCODE='22023'; END IF;
  BEGIN
   record_id:=(entry->>'id')::uuid;
   expected_revision:=(entry->>'revision')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
   RAISE EXCEPTION 'Invalid selected document ID or revision' USING ERRCODE='22023';
  END;
  IF record_id=ANY(ids) THEN
   RAISE EXCEPTION 'Duplicate selected document ID' USING ERRCODE='22023'; END IF;
  ids:=pg_catalog.array_append(ids,record_id);
  revisions:=pg_catalog.array_append(revisions,expected_revision);
 END LOOP;

 PERFORM d.id FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id AND d.id=ANY(ids)
  ORDER BY d.id FOR UPDATE;
 SELECT count(*) INTO total FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id AND d.workspace_id=actor_workspace AND d.id=ANY(ids);
 IF total<>pg_catalog.array_length(ids,1) THEN
  RAISE EXCEPTION 'One or more selected documents are missing or outside this workspace'
   USING ERRCODE='42501'; END IF;

 -- Validate every row before writing any row. One stale or incompatible record
 -- rejects the whole batch, so the client never receives a partial-success receipt.
 FOR idx IN 1..pg_catalog.array_length(ids,1) LOOP
  SELECT * INTO doc FROM public.tradelink_documents
   WHERE id=ids[idx] AND board_id=p_board_id AND workspace_id=actor_workspace;
  IF doc.id IS NULL OR doc.revision<>revisions[idx] OR doc.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'A selected document changed; refresh All Documents and retry'
    USING ERRCODE='40001'; END IF;
  IF p_action='hide' AND doc.hidden_at IS NOT NULL THEN
   RAISE EXCEPTION 'A selected document is already hidden' USING ERRCODE='40001'; END IF;
  IF p_action='unhide' AND doc.hidden_at IS NULL THEN
   RAISE EXCEPTION 'A selected document is not hidden' USING ERRCODE='40001'; END IF;
  IF p_action='delete' THEN
   SELECT * INTO projection FROM public.work_board_items
    WHERE id=doc.board_item_id AND board_id=p_board_id FOR UPDATE;
   IF projection.id IS NULL OR projection.title IS DISTINCT FROM doc.document_number THEN
    RAISE EXCEPTION 'A selected document Board link changed; refresh All Documents'
     USING ERRCODE='40001'; END IF;
  END IF;
 END LOOP;

 FOR idx IN 1..pg_catalog.array_length(ids,1) LOOP
  IF p_action='hide' THEN
   UPDATE public.tradelink_documents SET hidden_at=changed_at,hidden_by=actor
    WHERE id=ids[idx] AND board_id=p_board_id;
  ELSIF p_action='unhide' THEN
   UPDATE public.tradelink_documents SET hidden_at=NULL,hidden_by=NULL
    WHERE id=ids[idx] AND board_id=p_board_id;
  ELSE
   SELECT * INTO projection FROM public.work_board_items
    WHERE id=(SELECT d.board_item_id FROM public.tradelink_documents d WHERE d.id=ids[idx])
     AND board_id=p_board_id;
   IF projection.archived_at IS NULL THEN
    PERFORM public.wm_set_board_item_archived(projection.id,true);
   END IF;
   UPDATE public.tradelink_documents
    SET hidden_at=NULL,hidden_by=NULL,deleted_at=changed_at,deleted_by=actor
    WHERE id=ids[idx] AND board_id=p_board_id;
  END IF;
 END LOOP;

 PERFORM public.work_board_log(p_board_id,'tradelink.documents.bulk_'||p_action,
  'TradeLink document bulk action applied','tradelink-document-bulk',p_board_id::text,
  pg_catalog.jsonb_build_object('action',p_action,'count',pg_catalog.array_length(ids,1),
   'document_ids',pg_catalog.to_jsonb(ids)));

 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'documentId',d.id,'revision',d.revision,
  'hidden',d.hidden_at IS NOT NULL,'deleted',d.deleted_at IS NOT NULL
 ) ORDER BY d.id),'[]'::jsonb) INTO result_rows
 FROM public.tradelink_documents d WHERE d.board_id=p_board_id AND d.id=ANY(ids);
 RETURN pg_catalog.jsonb_build_object('boardId',p_board_id,'action',p_action,
  'applied',pg_catalog.array_length(ids,1),'documents',result_rows);
END $bulk$;
REVOKE ALL ON FUNCTION private.tl03_documents_bulk_action(uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_documents_bulk_action(uuid,text,jsonb)
 TO authenticated;

CREATE FUNCTION public.tl03_documents_bulk_action(
 p_board_id uuid,p_action text,p_rows jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $bulk_rpc$
 SELECT private.tl03_documents_bulk_action(p_board_id,p_action,p_rows);
$bulk_rpc$;
REVOKE ALL ON FUNCTION public.tl03_documents_bulk_action(uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_documents_bulk_action(uuid,text,jsonb)
 TO authenticated;

-- Deleted documents no longer open as live records. Their audit and revision
-- bundles remain intact for the existing immutable history path.
CREATE OR REPLACE FUNCTION public.tl03_document_read(
 p_board_id uuid,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $read$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink read denied' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.to_jsonb(d) INTO result FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id AND d.id=p_document_id AND d.deleted_at IS NULL;
 RETURN result;
END $read$;
REVOKE ALL ON FUNCTION public.tl03_document_read(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_read(uuid,uuid) TO authenticated;

DO $postflight$
DECLARE private_page pg_catalog.pg_proc%rowtype;
        public_page pg_catalog.pg_proc%rowtype;
        bulk_private pg_catalog.pg_proc%rowtype;
        bulk_public pg_catalog.pg_proc%rowtype;
BEGIN
 SELECT * INTO private_page FROM pg_catalog.pg_proc
  WHERE oid='private.tl03_documents_page(uuid,text,text,text,text,text,timestamptz,uuid,integer)'::regprocedure;
 SELECT * INTO public_page FROM pg_catalog.pg_proc
  WHERE oid='public.tl03_documents_page(uuid,text,text,text,text,text,timestamptz,uuid,integer)'::regprocedure;
 SELECT * INTO bulk_private FROM pg_catalog.pg_proc
  WHERE oid='private.tl03_documents_bulk_action(uuid,text,jsonb)'::regprocedure;
 SELECT * INTO bulk_public FROM pg_catalog.pg_proc
  WHERE oid='public.tl03_documents_bulk_action(uuid,text,jsonb)'::regprocedure;
 IF private_page.oid IS NULL OR NOT private_page.prosecdef
  OR public_page.oid IS NULL OR public_page.prosecdef
  OR bulk_private.oid IS NULL OR NOT bulk_private.prosecdef
  OR bulk_public.oid IS NULL OR bulk_public.prosecdef
  OR NOT has_function_privilege('authenticated',
   'public.tl03_documents_bulk_action(uuid,text,jsonb)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_documents_bulk_action(uuid,text,jsonb)','EXECUTE')
  OR has_function_privilege('anon',
   'private.tl03_documents_bulk_action(uuid,text,jsonb)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'private.tl03_documents_bulk_action(uuid,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'CP-TL bulk-action RPC contract or grants mismatch'
  USING ERRCODE='55000'; END IF;
END $postflight$;
COMMIT;
