-- CP-TL-CREATE-NEW-01
-- Enable the existing TradeLink module role "User" to create documents and
-- revise only its own Drafts. This is a domain capability, not Board manage.
-- Existing General Manager behavior and reviewer/approval operations remain.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';

DO $preflight$
BEGIN
 IF to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('private.tl03_save(uuid,uuid,bigint,text,jsonb,text)') IS NULL
  OR to_regprocedure('private.tl03_create_document(uuid,uuid,jsonb,text)') IS NULL
  OR to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL
  OR to_regprocedure('public.tl03_documents_list(uuid,integer)') IS NULL
  OR to_regprocedure('public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)') IS NULL
  OR to_regprocedure('public.tl03_document_revision_bundle(uuid,uuid,bigint)') IS NULL
  OR to_regprocedure('private.tl03_board_projection(uuid)') IS NULL
  OR to_regprocedure('private.tl03_can_create_draft(uuid)') IS NOT NULL
  OR to_regprocedure('private.tl03_can_read_own_document(uuid,uuid)') IS NOT NULL
  OR to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.tradelink_document_events') IS NULL
  OR to_regclass('public.work_board_items') IS NULL
  OR (SELECT relrowsecurity FROM pg_catalog.pg_class
      WHERE oid='public.tradelink_documents'::regclass) IS DISTINCT FROM TRUE
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy
      WHERE polrelid='public.tradelink_documents'::regclass
       AND polname='tl03_docs_read_creator')
  OR NOT has_function_privilege('authenticated',
    'public.tl03_document_create(uuid,uuid,jsonb,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
    'public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)','EXECUTE')
  OR has_function_privilege('anon',
    'public.tl03_document_create(uuid,uuid,jsonb,text)','EXECUTE')
  OR has_function_privilege('anon',
    'public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)','EXECUTE')
 THEN RAISE EXCEPTION 'CP-TL-CREATE-NEW-01 prerequisites or duplicate installation detected'
  USING ERRCODE='55000'; END IF;
END;
$preflight$;

-- Existing TradeLink "User" module assignment is the only additional role
-- eligible for the Create New domain capability. It does not imply generic
-- Board edit/manage, analytics, archive, approval, or operational authority.
CREATE FUNCTION private.tl03_can_create_draft(p_board_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR p_board_id IS DISTINCT FROM
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR private.wm_board_config_session_active() IS DISTINCT FROM TRUE
 THEN RETURN FALSE; END IF;
 RETURN public.has_module_access('tradelink',actor) IS TRUE
  AND public.module_role_for('tradelink',actor) IS NOT DISTINCT FROM 'User'
  AND EXISTS(
   SELECT 1 FROM auth.users u
   JOIN public.profiles p ON p.id=u.id
   JOIN public.work_boards b ON b.id=p_board_id
   JOIN public.workspace_members wm
    ON wm.workspace_id=b.workspace_id AND wm.user_id=actor AND wm.active IS TRUE
   WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL
    AND p.status='active'
    AND b.workspace_id=public.current_workspace_id(actor)
    AND b.name='TradeLink' AND b.status='active'
    AND b.archived_at IS NULL AND b.trashed_at IS NULL
    AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%'
  );
END;
$function$;
REVOKE ALL ON FUNCTION private.tl03_can_create_draft(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_can_create_draft(uuid) TO authenticated;

-- Owner reads are limited to documents created by the current signed User
-- in the same workspace. The helper never grants access to another user's row.
CREATE FUNCTION private.tl03_can_read_own_document(
 p_board_id uuid,p_document_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT private.tl03_can_create_draft(p_board_id) IS TRUE
  AND EXISTS(
   SELECT 1 FROM public.tradelink_documents d
   WHERE d.id=p_document_id AND d.board_id=p_board_id
    AND d.workspace_id=public.current_workspace_id(auth.uid())
    AND d.created_by=auth.uid()
  );
$function$;
REVOKE ALL ON FUNCTION private.tl03_can_read_own_document(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_can_read_own_document(uuid,uuid)
 TO authenticated;

-- The existing table policy remains the Board-manager policy. Add only an
-- owner-scoped SELECT policy so the invoker read/list RPCs can read own rows.
CREATE POLICY tl03_docs_read_creator ON public.tradelink_documents
 FOR SELECT TO authenticated
 USING(
  board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND created_by=(SELECT auth.uid())
  AND (SELECT private.tl03_can_create_draft(
   '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid)) IS TRUE
 );

-- Patch the existing revision-aware transaction in place. Its CAS, immutable
-- document number, two-reviewer validation, audit events, and atomic Board
-- projection remain byte-for-byte intact outside the two exact guard sites.
DO $save_patch$
DECLARE
 definition text;
 old_guard text;
 new_guard text;
 old_select text;
 new_select text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure
 ) INTO definition;
 old_guard := $old$
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document manager required'
  USING ERRCODE='42501'; END IF;
$old$;
 new_guard := $new$
 IF actor IS NULL THEN
  RAISE EXCEPTION 'Signed TradeLink session required' USING ERRCODE='42501';
 END IF;
$new$;
 IF definition IS NULL OR
  pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_guard,''))<>pg_catalog.length(old_guard)
 THEN RAISE EXCEPTION 'TradeLink save guard baseline drift; no change applied'
  USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.replace(definition,old_guard,new_guard);

 old_select := $old$
 SELECT * INTO d FROM public.tradelink_documents WHERE id=p_document_id FOR UPDATE;
$old$;
 new_select := $new$
 IF p_operation='create' THEN
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND (
    private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
    OR EXISTS(
     SELECT 1 FROM public.tradelink_documents existing
     WHERE existing.id=p_document_id AND existing.board_id=p_board_id
      AND existing.workspace_id=actor_workspace AND existing.created_by<>actor
    )
   )
  THEN RAISE EXCEPTION 'TradeLink Create New capability required'
   USING ERRCODE='42501'; END IF;
 ELSIF p_operation='update' THEN
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND (
    private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
    OR NOT EXISTS(
     SELECT 1 FROM public.tradelink_documents existing
     WHERE existing.id=p_document_id AND existing.board_id=p_board_id
      AND existing.workspace_id=actor_workspace AND existing.created_by=actor
    )
   )
  THEN RAISE EXCEPTION 'TradeLink Draft creator scope required'
   USING ERRCODE='42501'; END IF;
 ELSE
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'Signed TradeLink manager capability required'
   USING ERRCODE='42501'; END IF;
 END IF;
 SELECT * INTO d FROM public.tradelink_documents WHERE id=p_document_id FOR UPDATE;
 IF p_operation='create' THEN
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'TradeLink Create New capability required'
   USING ERRCODE='42501'; END IF;
 ELSIF p_operation='update' THEN
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND NOT (
    private.tl03_can_create_draft(p_board_id) IS TRUE
    AND d.id IS NOT NULL AND d.board_id=p_board_id
    AND d.workspace_id=actor_workspace AND d.created_by=actor
    AND d.archived_at IS NULL
    AND (
     d.workflow_state='draft'
     OR (
      p_expected_revision<9223372036854775807
      AND d.revision=p_expected_revision+1
      AND d.workflow_state=p_initial_state
      AND d.content=payload
      AND EXISTS(
       SELECT 1 FROM public.tradelink_document_events e
       WHERE e.document_id=d.id AND e.board_id=p_board_id
        AND e.workspace_id=actor_workspace AND e.revision=d.revision
        AND e.operation='updated' AND e.actor_id=actor
        AND e.metadata->>'fromState'='draft'
        AND e.metadata->>'toState'=p_initial_state
      )
     )
    )
   )
  THEN RAISE EXCEPTION 'Only the creator may revise their own TradeLink Draft'
   USING ERRCODE='42501'; END IF;
 ELSE
  IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'Signed TradeLink manager capability required'
   USING ERRCODE='42501'; END IF;
 END IF;
$new$;
 IF pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_select,''))<>pg_catalog.length(old_select)
 THEN RAISE EXCEPTION 'TradeLink save row-lock baseline drift; no change applied'
  USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.replace(definition,old_select,new_select);
 EXECUTE definition;
END;
$save_patch$;

-- Automatic server numbering uses the same existing save transaction. Permit
-- the same exact User capability at the create entry point; no other RPC grant
-- or numbering behavior changes.
DO $create_patch$
DECLARE definition text; old_guard text; new_guard text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'private.tl03_create_document(uuid,uuid,jsonb,text)'::regprocedure
 ) INTO definition;
 old_guard := $old$
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink document manager required' USING ERRCODE='42501'; END IF;
$old$;
 new_guard := $new$
 IF actor IS NULL OR (
   private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
   AND private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
 ) THEN
  RAISE EXCEPTION 'Signed TradeLink Create New capability required' USING ERRCODE='42501'; END IF;
$new$;
 IF definition IS NULL OR
  pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_guard,''))<>pg_catalog.length(old_guard)
 THEN RAISE EXCEPTION 'TradeLink automatic-number guard baseline drift'
  USING ERRCODE='55000'; END IF;
 EXECUTE pg_catalog.replace(definition,old_guard,new_guard);
END;
$create_patch$;

-- A creator can read their own persisted document, including its saved state.
-- All other reads retain the original General Manager boundary.
DO $read_patch$
DECLARE definition text; old_guard text; new_guard text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'public.tl03_document_read(uuid,uuid)'::regprocedure
 ) INTO definition;
 old_guard := $old$
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink read denied' USING ERRCODE='42501'; END IF;
$old$;
 new_guard := $new$
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  AND private.tl03_can_read_own_document(p_board_id,p_document_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document read denied'
  USING ERRCODE='42501'; END IF;
$new$;
 IF definition IS NULL OR
  pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_guard,''))<>pg_catalog.length(old_guard)
 THEN RAISE EXCEPTION 'TradeLink document-read guard baseline drift'
  USING ERRCODE='55000'; END IF;
 EXECUTE pg_catalog.replace(definition,old_guard,new_guard);
END;
$read_patch$;

-- The signed list returns all documents to managers, but only the current
-- creator's documents to the existing User role.
DO $list_patch$
DECLARE definition text; old_guard text; new_guard text;
 old_query text; new_query text; old_json text; new_json text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'public.tl03_documents_list(uuid,integer)'::regprocedure
 ) INTO definition;
 old_guard := $old$
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink list denied' USING ERRCODE='42501'; END IF;
$old$;
 new_guard := $new$
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  AND private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document list denied'
  USING ERRCODE='42501'; END IF;
$new$;
 old_query := $old$FROM(SELECT * FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id ORDER BY d.updated_at DESC,d.id DESC LIMIT p_limit)s;$old$;
 new_query := $new$FROM(SELECT * FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id
   AND d.workspace_id=public.current_workspace_id(auth.uid())
   AND (private.tl03_can_manage(p_board_id) IS TRUE OR d.created_by=auth.uid())
  ORDER BY d.updated_at DESC,d.id DESC LIMIT p_limit)s;$new$;
 old_json := $old$'archived',s.archived_at IS NOT NULL,'updatedAt',s.updated_at)$old$;
 new_json := $new$'archived',s.archived_at IS NOT NULL,'updatedAt',s.updated_at,
  'createdByActor',s.created_by=auth.uid())$new$;
 IF definition IS NULL OR
  pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_guard,''))<>pg_catalog.length(old_guard)
  OR pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_query,''))<>pg_catalog.length(old_query)
  OR pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_json,''))<>pg_catalog.length(old_json)
 THEN RAISE EXCEPTION 'TradeLink document-list baseline drift'
  USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.replace(definition,old_guard,new_guard);
 definition:=pg_catalog.replace(definition,old_query,new_query);
 EXECUTE pg_catalog.replace(definition,old_json,new_json);
END;
$list_patch$;

-- Signed keyset search uses the same server paging contract. For a User it
-- searches only documents created by that signed account; reviewer assignments
-- remain available through the existing assigned-document RPC.
DO $page_patch$
DECLARE definition text; old_guard text; new_guard text;
 old_select text; new_select text; old_filter text; new_filter text;
 old_json text; new_json text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)'::regprocedure
 ) INTO definition;
 old_guard := $old$
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink manager access required' USING ERRCODE='42501'; END IF;
$old$;
 new_guard := $new$
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  AND private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document search denied'
  USING ERRCODE='42501'; END IF;
$new$;
 old_select := $old$
  SELECT d.id,d.board_item_id,d.document_type,d.document_number,d.revision,
   d.workflow_state,d.archived_at,d.updated_at
$old$;
 new_select := $new$
  SELECT d.id,d.board_item_id,d.document_type,d.document_number,d.revision,
   d.workflow_state,d.archived_at,d.updated_at,d.created_by
$new$;
 old_filter := $old$
  WHERE d.board_id=p_board_id
   AND d.workspace_id=public.current_workspace_id(auth.uid())
$old$;
 new_filter := $new$
  WHERE d.board_id=p_board_id
   AND d.workspace_id=public.current_workspace_id(auth.uid())
   AND (private.tl03_can_manage(p_board_id) IS TRUE OR d.created_by=auth.uid())
$new$;
 old_json := $old$'archived',r.archived_at IS NOT NULL,'updatedAt',r.updated_at)$old$;
 new_json := $new$'archived',r.archived_at IS NOT NULL,'updatedAt',r.updated_at,
    'createdByActor',r.created_by=auth.uid())$new$;
 IF definition IS NULL OR
  pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_guard,''))<>pg_catalog.length(old_guard)
  OR pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_select,''))<>pg_catalog.length(old_select)
  OR pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_filter,''))<>pg_catalog.length(old_filter)
  OR pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_json,''))<>pg_catalog.length(old_json)
 THEN RAISE EXCEPTION 'TradeLink document-page baseline drift'
  USING ERRCODE='55000'; END IF;
 definition:=pg_catalog.replace(definition,old_guard,new_guard);
 definition:=pg_catalog.replace(definition,old_select,new_select);
 definition:=pg_catalog.replace(definition,old_filter,new_filter);
 EXECUTE pg_catalog.replace(definition,old_json,new_json);
END;
$page_patch$;

-- Extend the existing exact-record Board projection to the creator's own
-- document. Assigned reviewers continue through the unchanged assigned reader.
DO $projection_patch$
DECLARE definition text; old_branch text; new_branch text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'private.tl03_board_projection(uuid)'::regprocedure
 ) INTO definition;
 old_branch := $old$
 ELSE
  v_document:=private.tl03_document_read_assigned(v_board_id,p_document_id);
 END IF;
$old$;
 new_branch := $new$
 ELSIF private.tl03_can_read_own_document(v_board_id,p_document_id) IS TRUE THEN
  SELECT pg_catalog.to_jsonb(d) INTO v_document
  FROM public.tradelink_documents d
  WHERE d.id=p_document_id AND d.board_id=v_board_id
   AND d.workspace_id=public.current_workspace_id(v_actor)
   AND d.created_by=v_actor;
 ELSE
  v_document:=private.tl03_document_read_assigned(v_board_id,p_document_id);
 END IF;
$new$;
 IF definition IS NULL OR
  pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_branch,''))<>pg_catalog.length(old_branch)
 THEN RAISE EXCEPTION 'TradeLink Board-projection baseline drift'
  USING ERRCODE='55000'; END IF;
 EXECUTE pg_catalog.replace(definition,old_branch,new_branch);
END;
$projection_patch$;

-- Creator readback includes the existing immutable revision snapshots. It does
-- not enable status transitions, approvals, attachments, or manager analytics.
DO $revision_patch$
DECLARE definition text; old_guard text; new_guard text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'public.tl03_document_revision_bundle(uuid,uuid,bigint)'::regprocedure
 ) INTO definition;
 old_guard := $old$
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink manager access required' USING ERRCODE='42501';
 END IF;
$old$;
 new_guard := $new$
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  AND private.tl03_can_read_own_document(p_board_id,p_document_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink revision read denied'
  USING ERRCODE='42501'; END IF;
$new$;
 IF definition IS NULL OR
  pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_guard,''))<>pg_catalog.length(old_guard)
 THEN RAISE EXCEPTION 'TradeLink revision-bundle baseline drift'
  USING ERRCODE='55000'; END IF;
 EXECUTE pg_catalog.replace(definition,old_guard,new_guard);
END;
$revision_patch$;

DO $postflight$
DECLARE
 f pg_catalog.pg_proc%rowtype;
 definition text;
BEGIN
 SELECT * INTO f FROM pg_catalog.pg_proc
 WHERE oid='private.tl03_can_create_draft(uuid)'::regprocedure;
 IF f.oid IS NULL OR NOT f.prosecdef
  OR pg_catalog.pg_get_userbyid(f.proowner)<>'postgres'
  OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
  OR has_function_privilege('anon',f.oid,'EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink create capability helper postflight failed'
  USING ERRCODE='55000'; END IF;

 SELECT * INTO f FROM pg_catalog.pg_proc
 WHERE oid='private.tl03_can_read_own_document(uuid,uuid)'::regprocedure;
 IF f.oid IS NULL OR NOT f.prosecdef
  OR pg_catalog.pg_get_userbyid(f.proowner)<>'postgres'
  OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
  OR has_function_privilege('anon',f.oid,'EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink owner-read helper postflight failed'
  USING ERRCODE='55000'; END IF;

 IF NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_policy p
  WHERE p.polrelid='public.tradelink_documents'::regclass
   AND p.polname='tl03_docs_read_creator'
   AND position('created_by = ( SELECT auth.uid()' IN
    pg_catalog.pg_get_expr(p.polqual,p.polrelid))>0
   AND position('private.tl03_can_create_draft' IN
    pg_catalog.pg_get_expr(p.polqual,p.polrelid))>0
   AND position('264ca40d-6e4a-4e4f-97e6-3bd77c97cd88' IN
    pg_catalog.pg_get_expr(p.polqual,p.polrelid))>0
 ) OR NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_policy p
  WHERE p.polrelid='public.tradelink_documents'::regclass
   AND p.polname='tl03_docs_read'
   AND pg_catalog.pg_get_expr(p.polqual,p.polrelid)='private.tl03_can_manage(board_id)'
 ) THEN RAISE EXCEPTION 'TradeLink owner read policy or existing manager policy postflight failed'
  USING ERRCODE='55000'; END IF;

 SELECT * INTO f FROM pg_catalog.pg_proc
 WHERE oid='private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure;
 definition:=pg_catalog.pg_get_functiondef(f.oid);
 IF f.oid IS NULL OR NOT f.prosecdef
  OR pg_catalog.pg_get_userbyid(f.proowner)<>'postgres'
  OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
  OR has_function_privilege('anon',f.oid,'EXECUTE')
  OR position('private.tl03_can_create_draft(p_board_id)' IN definition)=0
  OR position('Only the creator may revise their own TradeLink Draft' IN definition)=0
  OR position('e.metadata->>''fromState''=''draft''' IN definition)=0
 THEN RAISE EXCEPTION 'TradeLink save capability postflight failed'
  USING ERRCODE='55000'; END IF;

 IF NOT has_function_privilege('authenticated',
    'public.tl03_document_create(uuid,uuid,jsonb,text)','EXECUTE')
  OR has_function_privilege('anon',
    'public.tl03_document_create(uuid,uuid,jsonb,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
    'public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)','EXECUTE')
  OR has_function_privilege('anon',
    'public.tl03_document_save(uuid,uuid,bigint,text,jsonb,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
    'public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)','EXECUTE')
  OR has_function_privilege('anon',
    'public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
    'public.tl03_document_revision_bundle(uuid,uuid,bigint)','EXECUTE')
  OR has_function_privilege('anon',
    'public.tl03_document_revision_bundle(uuid,uuid,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink existing RPC grants changed unexpectedly'
  USING ERRCODE='55000'; END IF;

 -- The original Board-manager predicate is deliberately unchanged.
 IF position('work_board_access(p_board_id,''manage'')' IN
    pg_catalog.pg_get_functiondef('private.tl03_can_manage(uuid)'::regprocedure))=0
  OR position('General Manager' IN
    pg_catalog.pg_get_functiondef('private.tl03_can_manage(uuid)'::regprocedure))=0
 THEN RAISE EXCEPTION 'Existing TradeLink Board-manager boundary changed'
  USING ERRCODE='55000'; END IF;
END;
$postflight$;
COMMIT;
