-- CP-TL-SHARED-DOCUMENT-VISIBILITY-01
-- Share the existing TradeLink repository and document reads with every
-- active TradeLink module user in the current workspace. Preserve all write,
-- review, approval, and manager-only bulk-action contracts.
BEGIN;

DO $preflight$
DECLARE
 v_read_policy text;
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.profiles') IS NULL
  OR to_regclass('public.workspace_members') IS NULL
  OR to_regclass('public.work_boards') IS NULL
  OR to_regprocedure('public.has_module_access(text,uuid)') IS NULL
  OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
  OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
  OR to_regprocedure('private.tl03_can_review(uuid)') IS NULL
  OR to_regprocedure('private.tl03_documents_page(uuid,text,text,text,text,text,timestamp with time zone,uuid,integer)') IS NULL
  OR to_regprocedure('public.tl03_documents_page(uuid,text,text,text,text,text,timestamp with time zone,uuid,integer)') IS NULL
  OR to_regprocedure('public.tl03_documents_list(uuid,integer)') IS NULL
  OR to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL
  OR to_regprocedure('public.tl03_document_revision_bundle(uuid,uuid,bigint)') IS NULL
  OR to_regprocedure('private.tl03_document_creator_name(uuid,uuid)') IS NULL
  OR to_regprocedure('private.tl03_documents_bulk_action(uuid,text,jsonb)') IS NULL
  OR to_regprocedure('public.tl03_documents_bulk_action(uuid,text,jsonb)') IS NULL
  OR to_regprocedure('private.tl03_can_view_documents(uuid)') IS NOT NULL
  OR md5(pg_get_functiondef('private.tl03_documents_page(uuid,text,text,text,text,text,timestamp with time zone,uuid,integer)'::regprocedure))
    IS DISTINCT FROM 'c78500fcb08c61a7594c8c2e828e7a7f'
  OR md5(pg_get_functiondef('public.tl03_documents_list(uuid,integer)'::regprocedure))
    IS DISTINCT FROM '5913d5f61641c31c1b33cd666333d49b'
  OR md5(pg_get_functiondef('public.tl03_document_read(uuid,uuid)'::regprocedure))
    IS DISTINCT FROM '24301d2ddaa664c72d22a9773d92f2e1'
  OR md5(pg_get_functiondef('public.tl03_document_revision_bundle(uuid,uuid,bigint)'::regprocedure))
    IS DISTINCT FROM '05682519bd3dde86f591ddd9d1bda8d3'
  OR md5(pg_get_functiondef('private.tl03_document_creator_name(uuid,uuid)'::regprocedure))
    IS DISTINCT FROM 'f9c03a59a5bdd60a7cab9985b68e54d9'
  -- Pin both bulk-action RPCs. This migration must not alter their existing
  -- General Manager-only mutation boundary.
  OR md5(pg_get_functiondef('private.tl03_documents_bulk_action(uuid,text,jsonb)'::regprocedure))
    IS DISTINCT FROM '46734221a0b71b347b750093ae781136'
  OR md5(pg_get_functiondef('public.tl03_documents_bulk_action(uuid,text,jsonb)'::regprocedure))
    IS DISTINCT FROM '290410fc64f574dbbff729307c62d946'
  OR NOT has_function_privilege('authenticated',
    'public.tl03_documents_page(uuid,text,text,text,text,text,timestamp with time zone,uuid,integer)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
    'public.tl03_documents_list(uuid,integer)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
    'public.tl03_document_read(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
    'public.tl03_document_revision_bundle(uuid,uuid,bigint)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
    'public.tl03_documents_bulk_action(uuid,text,jsonb)','EXECUTE')
  OR NOT (SELECT relrowsecurity FROM pg_class
    WHERE oid='public.tradelink_documents'::regclass)
 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 prerequisite, source, or grant drift'
   USING ERRCODE='55000';
 END IF;

 SELECT pg_get_expr(polqual,polrelid) INTO v_read_policy
 FROM pg_policy
 WHERE polrelid='public.tradelink_documents'::regclass
  AND polname='tl03_docs_read' AND polcmd='r';

 IF v_read_policy IS NULL
  OR position('private.tl03_can_manage' IN v_read_policy)=0
  OR position('private.tl03_can_create_draft' IN v_read_policy)=0
  OR position('created_by' IN v_read_policy)=0
  OR (SELECT count(*) FROM pg_policy
      WHERE polrelid='public.tradelink_documents'::regclass
       AND polcmd IN ('r','*'))<>1
 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 document read policy drift'
   USING ERRCODE='55000';
 END IF;
END;
$preflight$;

-- A read-only capability shared by every active TradeLink module role.
-- It is deliberately workspace-scoped and does not grant create, edit,
-- review, approval, archive, hide, unhide, or delete capabilities.
CREATE FUNCTION private.tl03_can_view_documents(p_board_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $view$
DECLARE
 v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL
  OR p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR private.wm_board_config_session_active() IS DISTINCT FROM TRUE
  OR public.has_module_access('tradelink',v_actor) IS DISTINCT FROM TRUE
 THEN
  RETURN false;
 END IF;

 RETURN EXISTS(
  SELECT 1
  FROM auth.users u
  JOIN public.profiles p ON p.id=u.id
  JOIN public.work_boards b ON b.id=p_board_id
  JOIN public.workspace_members wm
   ON wm.user_id=v_actor AND wm.workspace_id=b.workspace_id AND wm.active IS TRUE
  WHERE u.id=v_actor AND u.email_confirmed_at IS NOT NULL
   AND p.status='active'
   AND b.workspace_id=public.current_workspace_id(v_actor)
   AND b.name='TradeLink' AND b.status='active'
   AND b.archived_at IS NULL AND b.trashed_at IS NULL
   AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%'
 );
END;
$view$;

REVOKE ALL ON FUNCTION private.tl03_can_view_documents(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_can_view_documents(uuid)
 TO authenticated;
COMMENT ON FUNCTION private.tl03_can_view_documents(uuid) IS
 'Read-only TradeLink repository capability for active module users in the current workspace. Does not grant document mutations or manager-only bulk actions.';

-- All Documents: remove the creator/reviewer row partition. Keep workspace,
-- Keep the existing p_archive_mode and p_visibility_mode predicates unchanged.
-- archive, visibility, search, module, workflow, keyset and page-size filters.
DO $page$
DECLARE
 v_definition text;
 v_old text;
BEGIN
 v_definition:=pg_get_functiondef(
  'private.tl03_documents_page(uuid,text,text,text,text,text,timestamp with time zone,uuid,integer)'::regprocedure);

 v_old:=E' v_can_manage boolean;\n v_can_create boolean;\n';
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 page declaration drift'
   USING ERRCODE='55000';
 END IF;
 v_definition:=replace(v_definition,v_old,'');

 v_old:=E' v_can_manage:=coalesce(private.tl03_can_manage(p_board_id),false);\n v_can_create:=coalesce(private.tl03_can_create_draft(p_board_id),false);\n';
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 page capability drift'
   USING ERRCODE='55000';
 END IF;
 v_definition:=replace(v_definition,v_old,'');

 v_old:=' IF v_workspace IS NULL OR NOT (v_can_manage OR v_can_create OR v_can_review) THEN';
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 page read gate drift'
   USING ERRCODE='55000';
 END IF;
 v_definition:=replace(v_definition,
  v_old,
  ' IF v_workspace IS NULL OR private.tl03_can_view_documents(p_board_id) IS DISTINCT FROM TRUE THEN');

 v_old:=E'   AND (v_can_manage OR d.hidden_at IS NULL)\n';
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 hidden-row scope drift'
   USING ERRCODE='55000';
 END IF;
 v_definition:=replace(v_definition,E'   AND (v_can_manage OR d.hidden_at IS NULL)\n','');

 v_old:=E'   AND (\n    v_can_manage\n    OR (v_can_create AND d.created_by=v_actor)\n    OR (v_can_review AND d.archived_at IS NULL AND v_actor_email IS NOT NULL\n     AND v_actor_email IN (\n      private.tl03_review_assignee(d.document_type,d.content,''primary''),\n      private.tl03_review_assignee(d.document_type,d.content,''secondary'')\n     ))\n   )\n';
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 creator/reviewer partition drift'
   USING ERRCODE='55000';
 END IF;
 v_definition:=replace(v_definition,v_old,'');

 EXECUTE v_definition;
END;
$page$;

-- Legacy bounded list fallback: all visible, non-deleted workspace documents.
DO $list$
DECLARE
 v_definition text;
 v_old text;
BEGIN
 v_definition:=pg_get_functiondef(
  'public.tl03_documents_list(uuid,integer)'::regprocedure);

 v_old:=E' IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE\n  AND private.tl03_can_create_draft(p_board_id) IS DISTINCT FROM TRUE\n THEN RAISE EXCEPTION ''Signed TradeLink document list denied'' USING ERRCODE=''42501''; END IF;';
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 list read gate drift'
   USING ERRCODE='55000';
 END IF;
 v_definition:=replace(v_definition,v_old,
  E' IF private.tl03_can_view_documents(p_board_id) IS DISTINCT FROM TRUE\n THEN RAISE EXCEPTION ''Signed TradeLink document list denied'' USING ERRCODE=''42501''; END IF;');

 v_old:=E'   AND (private.tl03_can_manage(p_board_id) IS TRUE OR d.created_by=auth.uid())\n';
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 list creator filter drift'
   USING ERRCODE='55000';
 END IF;
 v_definition:=replace(v_definition,v_old,'');

 EXECUTE v_definition;
END;
$list$;

-- Read a shared document while retaining the existing immutable write and
-- creator-owned edit rules in their separate mutation RPCs.
DO $document_read$
DECLARE
 v_definition text;
 v_old text;
BEGIN
 v_definition:=pg_get_functiondef('public.tl03_document_read(uuid,uuid)'::regprocedure);
 v_old:=E' IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE\n  AND private.tl03_can_read_own_document(p_board_id,p_document_id) IS DISTINCT FROM TRUE\n THEN RAISE EXCEPTION ''Signed TradeLink document read denied'' USING ERRCODE=''42501''; END IF;';
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 document read gate drift'
   USING ERRCODE='55000';
 END IF;
 v_definition:=replace(v_definition,v_old,
  E' IF private.tl03_can_view_documents(p_board_id) IS DISTINCT FROM TRUE\n THEN RAISE EXCEPTION ''Signed TradeLink document read denied'' USING ERRCODE=''42501''; END IF;');
 EXECUTE v_definition;
END;
$document_read$;

DO $creator_name$
DECLARE
 v_definition text;
 v_old text;
BEGIN
 v_definition:=pg_get_functiondef(
  'private.tl03_document_creator_name(uuid,uuid)'::regprocedure);
 v_old:=E' IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE\n  AND private.tl03_can_read_own_document(p_board_id,p_document_id) IS DISTINCT FROM TRUE\n THEN\n  RAISE EXCEPTION ''Signed TradeLink document read denied'' USING ERRCODE=''42501'';\n END IF;';
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 creator-name read gate drift'
   USING ERRCODE='55000';
 END IF;
 v_definition:=replace(v_definition,v_old,
  E' IF private.tl03_can_view_documents(p_board_id) IS DISTINCT FROM TRUE THEN\n  RAISE EXCEPTION ''Signed TradeLink document read denied'' USING ERRCODE=''42501'';\n END IF;');
 EXECUTE v_definition;
END;
$creator_name$;

DO $revision_bundle$
DECLARE
 v_definition text;
 v_old text;
BEGIN
 v_definition:=pg_get_functiondef(
  'public.tl03_document_revision_bundle(uuid,uuid,bigint)'::regprocedure);
 v_old:=E' IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE\n  AND private.tl03_can_read_own_document(p_board_id,p_document_id) IS DISTINCT FROM TRUE\n THEN RAISE EXCEPTION ''Signed TradeLink revision read denied''\n  USING ERRCODE=''42501''; END IF;';
 IF position(v_old IN v_definition)=0 THEN
  RAISE EXCEPTION 'CP-TL-SHARED-DOCUMENT-VISIBILITY-01 revision read gate drift'
   USING ERRCODE='55000';
 END IF;
 v_definition:=replace(v_definition,v_old,
  E' IF private.tl03_can_view_documents(p_board_id) IS DISTINCT FROM TRUE\n THEN RAISE EXCEPTION ''Signed TradeLink revision read denied''\n  USING ERRCODE=''42501''; END IF;');
 EXECUTE v_definition;
END;
$revision_bundle$;

-- Only the SELECT policy changes. No INSERT, UPDATE, DELETE or bulk-action
-- policy/function is created, broadened, or replaced.
DROP POLICY tl03_docs_read ON public.tradelink_documents;
CREATE POLICY tl03_docs_read ON public.tradelink_documents
 FOR SELECT TO authenticated
 USING(private.tl03_can_view_documents(board_id) IS TRUE);

COMMIT;
