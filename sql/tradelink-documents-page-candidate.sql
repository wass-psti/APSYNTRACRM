-- TradeLink All Documents: signed server-side filtering and keyset pagination.
-- SOURCE-ONLY candidate. Do not apply to production without separate approval
-- for a new authenticated-executable RPC. Existing list/read/write APIs remain.
-- No table, RLS, role, Storage or existing-function changes.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('public.tl03_documents_list(uuid,integer)') IS NULL
  OR to_regclass('public.tradelink_documents') IS NULL
  OR to_regprocedure('public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)') IS NOT NULL
  OR NOT has_function_privilege('authenticated','public.tl03_documents_list(uuid,integer)','EXECUTE')
  OR has_function_privilege('anon','public.tl03_documents_list(uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink document-page RPC installation prerequisites not met'
  USING ERRCODE='42501'; END IF;
END $preflight$;

CREATE FUNCTION public.tl03_documents_page(
 p_board_id uuid,p_search text DEFAULT '',p_document_type text DEFAULT 'all',
 p_workflow_state text DEFAULT 'all',p_archive_mode text DEFAULT 'active',
 p_before_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,
 p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $page$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink manager access required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
  OR p_search IS NULL OR pg_catalog.char_length(p_search)>120
  OR p_document_type IS NULL OR p_document_type NOT IN
    ('all','esi','packing','delivery','payment','quotation','po')
  OR p_workflow_state IS NULL OR p_workflow_state NOT IN
    ('all','draft','submitted','under-review','revision-required',
     'approved','rejected','completed','cancelled')
  OR p_archive_mode IS NULL OR p_archive_mode NOT IN ('all','active','archived')
  OR ((p_before_at IS NULL) <> (p_before_id IS NULL)) THEN
  RAISE EXCEPTION 'Invalid bounded TradeLink search parameters' USING ERRCODE='22023'; END IF;
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
  ORDER BY d.updated_at DESC,d.id DESC
  LIMIT (p_limit+1)
 ), ranked AS (
  SELECT l.*,pg_catalog.row_number() OVER (ORDER BY l.updated_at DESC,l.id DESC) rn
  FROM limited l
 )
 SELECT pg_catalog.jsonb_build_object(
   'rows',COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'documentId',r.id,'boardItemId',r.board_item_id,
    'documentType',r.document_type,'documentNumber',r.document_number,
    'revision',r.revision,'workflowState',r.workflow_state,
    'archived',r.archived_at IS NOT NULL,'updatedAt',r.updated_at)
    ORDER BY r.updated_at DESC,r.id DESC)
    FILTER (WHERE r.rn<=p_limit),'[]'::jsonb),
   'hasMore',pg_catalog.count(*)>p_limit,
   'nextCursor',CASE WHEN pg_catalog.count(*)>p_limit THEN
     (SELECT pg_catalog.jsonb_build_object('updatedAt',last.updated_at,'documentId',last.id)
      FROM ranked last WHERE last.rn=p_limit) ELSE NULL END
 ) INTO result FROM ranked r;
 RETURN result;
END $page$;
REVOKE ALL ON FUNCTION public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)
 TO authenticated;

DO $postflight$
BEGIN
 IF NOT has_function_privilege('authenticated',
     'public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)','EXECUTE')
  OR has_function_privilege('anon',
     'public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)','EXECUTE')
  OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE
     p.oid='public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)'::regprocedure
     AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
 THEN RAISE EXCEPTION 'TradeLink document-page RPC permission or invoker posture drift'
  USING ERRCODE='42501'; END IF;
END $postflight$;
COMMIT;
