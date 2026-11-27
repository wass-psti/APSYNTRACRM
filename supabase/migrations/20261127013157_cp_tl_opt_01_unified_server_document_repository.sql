BEGIN;

DO $preflight$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('private.tradelink_document_reviews') IS NULL
  OR to_regclass('public.profiles') IS NULL
  OR to_regprocedure('private.tl03_can_view_documents(uuid)') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('private.tl03_can_create_draft(uuid)') IS NULL
  OR to_regprocedure('private.tl03_can_review(uuid)') IS NULL
  OR to_regprocedure('private.tl03_review_assignee(text,jsonb,text)') IS NULL
  OR to_regprocedure('private.tl03_revision_approval_policy(uuid,bigint)') IS NULL
  OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
  OR to_regprocedure('public.current_workspace_id(uuid)') IS NULL
  OR to_regprocedure('public.tl03_documents_page(uuid,text,text,text,text,text,timestamptz,uuid,integer)') IS NULL
  OR to_regprocedure('private.tl03_documents_query(uuid,text,text,text,text,text,date,date,text,text,jsonb,integer)') IS NOT NULL
  OR to_regprocedure('public.tl03_documents_query(uuid,text,text,text,text,text,date,date,text,text,jsonb,integer)') IS NOT NULL
  OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_extension e
   JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
   WHERE e.extname='pg_trgm' AND n.nspname='extensions'
  )
 THEN RAISE EXCEPTION 'CP-TL-OPT-01 repository query prerequisites or duplicate installation detected'
  USING ERRCODE='55000'; END IF;
END $preflight$;

-- Existing created/updated indexes remain in place. These additive indexes
-- support the remaining global sort fields and literal substring searches.
CREATE INDEX IF NOT EXISTS tl03_document_sort_number
 ON public.tradelink_documents(board_id,lower(document_number),id)
 WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tl03_document_sort_type
 ON public.tradelink_documents(board_id,lower(document_type),id)
 WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tl03_document_sort_revision
 ON public.tradelink_documents(board_id,revision,id)
 WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tl03_document_search_number_trgm
 ON public.tradelink_documents
 USING gin(lower(document_number) extensions.gin_trgm_ops)
 WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tl03_document_search_client_trgm
 ON public.tradelink_documents
 USING gin(lower(coalesce(content->>'customerName','')) extensions.gin_trgm_ops)
 WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tl03_document_search_reference_trgm
 ON public.tradelink_documents
 USING gin(lower(coalesce(content->>'referenceNumber','')) extensions.gin_trgm_ops)
 WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tl03_document_search_po_reference_trgm
 ON public.tradelink_documents
 USING gin(lower(coalesce(content->>'poNumber','')) extensions.gin_trgm_ops)
 WHERE deleted_at IS NULL;

CREATE FUNCTION private.tl03_documents_query(
 p_board_id uuid,
 p_search text,
 p_document_type text,
 p_workflow_state text,
 p_archive_mode text,
 p_visibility_mode text,
 p_updated_from date,
 p_updated_to date,
 p_sort_by text,
 p_sort_direction text,
 p_cursor jsonb,
 p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $repository$
DECLARE
 v_actor uuid:=auth.uid();
 v_workspace uuid;
 v_actor_email text;
 v_can_manage boolean;
 v_can_create boolean;
 v_can_review boolean;
 v_search text;
 v_search_pattern text;
 v_cursor_id uuid;
 v_cursor_at timestamptz;
 v_cursor_text text;
 v_cursor_revision bigint;
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
 IF v_workspace IS NULL OR private.tl03_can_view_documents(p_board_id) IS DISTINCT FROM TRUE THEN
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
  OR p_sort_by IS NULL OR p_sort_by NOT IN
   ('createdAt','updatedAt','documentNumber','documentType','revision')
  OR p_sort_direction IS NULL OR p_sort_direction NOT IN ('asc','desc')
  OR (p_updated_from IS NOT NULL AND p_updated_to IS NOT NULL
      AND p_updated_from>p_updated_to)
 THEN RAISE EXCEPTION 'Invalid bounded TradeLink repository query parameters'
  USING ERRCODE='22023'; END IF;

 IF p_cursor IS NOT NULL THEN
  IF pg_catalog.jsonb_typeof(p_cursor) IS DISTINCT FROM 'object'
   OR pg_catalog.jsonb_object_length(p_cursor)<>3
   OR p_cursor->>'sortBy' IS DISTINCT FROM p_sort_by
   OR (p_cursor->>'documentId') !~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR pg_catalog.jsonb_typeof(p_cursor->'sortValue') IS DISTINCT FROM 'string'
   OR pg_catalog.char_length(p_cursor->>'sortValue')>2000
  THEN RAISE EXCEPTION 'Invalid TradeLink repository cursor' USING ERRCODE='22023'; END IF;
  v_cursor_id:=(p_cursor->>'documentId')::uuid;
  BEGIN
   IF p_sort_by IN ('createdAt','updatedAt') THEN
    v_cursor_at:=(p_cursor->>'sortValue')::timestamptz;
   ELSIF p_sort_by IN ('documentNumber','documentType') THEN
    v_cursor_text:=pg_catalog.lower(p_cursor->>'sortValue');
   ELSE
    IF (p_cursor->>'sortValue') !~ '^[0-9]{1,18}$' THEN
     RAISE EXCEPTION 'Invalid revision cursor';
    END IF;
    v_cursor_revision:=(p_cursor->>'sortValue')::bigint;
   END IF;
  EXCEPTION WHEN others THEN
   RAISE EXCEPTION 'Invalid TradeLink repository cursor value' USING ERRCODE='22023';
  END;
 END IF;

 IF v_can_review THEN
  SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO v_actor_email
  FROM auth.users u WHERE u.id=v_actor AND u.email_confirmed_at IS NOT NULL;
 END IF;

 v_search:=pg_catalog.lower(pg_catalog.btrim(p_search));
 v_search_pattern:='%'||
  pg_catalog.replace(
   pg_catalog.replace(
    pg_catalog.replace(v_search,E'\\',E'\\\\'),
    '%',E'\\%'),
   '_',E'\\_')||'%';

 WITH matching AS NOT MATERIALIZED (
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
    v_search=''
    OR pg_catalog.lower(d.document_number) LIKE v_search_pattern ESCAPE E'\\'
    OR pg_catalog.lower(coalesce(d.content->>'customerName','')) LIKE v_search_pattern ESCAPE E'\\'
    OR pg_catalog.lower(coalesce(d.content->>'referenceNumber','')) LIKE v_search_pattern ESCAPE E'\\'
    OR pg_catalog.lower(coalesce(d.content->>'poNumber','')) LIKE v_search_pattern ESCAPE E'\\'
   )
   AND (p_document_type='all' OR d.document_type=p_document_type)
   AND (p_workflow_state='all' OR d.workflow_state=p_workflow_state)
   AND (p_archive_mode='all'
    OR (p_archive_mode='active' AND d.archived_at IS NULL)
    OR (p_archive_mode='archived' AND d.archived_at IS NOT NULL))
   AND (p_updated_from IS NULL OR
    d.updated_at >= (p_updated_from::timestamp without time zone AT TIME ZONE 'UTC'))
   AND (p_updated_to IS NULL OR
    d.updated_at < ((p_updated_to+1)::timestamp without time zone AT TIME ZONE 'UTC'))
   AND (
    v_can_manage
    OR (v_can_create AND d.created_by=v_actor)
    OR (v_can_review AND d.archived_at IS NULL AND v_actor_email IS NOT NULL
     AND v_actor_email IN (
      private.tl03_review_assignee(d.document_type,d.content,'primary'),
      private.tl03_review_assignee(d.document_type,d.content,'secondary')
     ))
   )
 ),
 page_rows AS MATERIALIZED (
  SELECT m.*
  FROM matching m
  WHERE p_cursor IS NULL OR CASE
   WHEN p_sort_by='createdAt' AND p_sort_direction='asc' THEN
    (m.created_at>v_cursor_at OR (m.created_at=v_cursor_at AND m.id>v_cursor_id))
   WHEN p_sort_by='createdAt' AND p_sort_direction='desc' THEN
    (m.created_at<v_cursor_at OR (m.created_at=v_cursor_at AND m.id<v_cursor_id))
   WHEN p_sort_by='updatedAt' AND p_sort_direction='asc' THEN
    (m.updated_at>v_cursor_at OR (m.updated_at=v_cursor_at AND m.id>v_cursor_id))
   WHEN p_sort_by='updatedAt' AND p_sort_direction='desc' THEN
    (m.updated_at<v_cursor_at OR (m.updated_at=v_cursor_at AND m.id<v_cursor_id))
   WHEN p_sort_by='documentNumber' AND p_sort_direction='asc' THEN
    (pg_catalog.lower(m.document_number)>v_cursor_text OR
     (pg_catalog.lower(m.document_number)=v_cursor_text AND m.id>v_cursor_id))
   WHEN p_sort_by='documentNumber' AND p_sort_direction='desc' THEN
    (pg_catalog.lower(m.document_number)<v_cursor_text OR
     (pg_catalog.lower(m.document_number)=v_cursor_text AND m.id<v_cursor_id))
   WHEN p_sort_by='documentType' AND p_sort_direction='asc' THEN
    (pg_catalog.lower(m.document_type)>v_cursor_text OR
     (pg_catalog.lower(m.document_type)=v_cursor_text AND m.id>v_cursor_id))
   WHEN p_sort_by='documentType' AND p_sort_direction='desc' THEN
    (pg_catalog.lower(m.document_type)<v_cursor_text OR
     (pg_catalog.lower(m.document_type)=v_cursor_text AND m.id<v_cursor_id))
   WHEN p_sort_by='revision' AND p_sort_direction='asc' THEN
    (m.revision>v_cursor_revision OR (m.revision=v_cursor_revision AND m.id>v_cursor_id))
   WHEN p_sort_by='revision' AND p_sort_direction='desc' THEN
    (m.revision<v_cursor_revision OR (m.revision=v_cursor_revision AND m.id<v_cursor_id))
   ELSE false
  END
  ORDER BY
   CASE WHEN p_sort_by='createdAt' AND p_sort_direction='asc' THEN m.created_at END ASC,
   CASE WHEN p_sort_by='createdAt' AND p_sort_direction='desc' THEN m.created_at END DESC,
   CASE WHEN p_sort_by='updatedAt' AND p_sort_direction='asc' THEN m.updated_at END ASC,
   CASE WHEN p_sort_by='updatedAt' AND p_sort_direction='desc' THEN m.updated_at END DESC,
   CASE WHEN p_sort_by='documentNumber' AND p_sort_direction='asc' THEN pg_catalog.lower(m.document_number) END ASC,
   CASE WHEN p_sort_by='documentNumber' AND p_sort_direction='desc' THEN pg_catalog.lower(m.document_number) END DESC,
   CASE WHEN p_sort_by='documentType' AND p_sort_direction='asc' THEN pg_catalog.lower(m.document_type) END ASC,
   CASE WHEN p_sort_by='documentType' AND p_sort_direction='desc' THEN pg_catalog.lower(m.document_type) END DESC,
   CASE WHEN p_sort_by='revision' AND p_sort_direction='asc' THEN m.revision END ASC,
   CASE WHEN p_sort_by='revision' AND p_sort_direction='desc' THEN m.revision END DESC,
   CASE WHEN p_sort_direction='asc' THEN m.id END ASC,
   CASE WHEN p_sort_direction='desc' THEN m.id END DESC
  LIMIT (p_limit+1)
 ),
 ranked AS (
  SELECT p.*,
   pg_catalog.row_number() OVER(ORDER BY
    CASE WHEN p_sort_by='createdAt' AND p_sort_direction='asc' THEN p.created_at END ASC,
    CASE WHEN p_sort_by='createdAt' AND p_sort_direction='desc' THEN p.created_at END DESC,
    CASE WHEN p_sort_by='updatedAt' AND p_sort_direction='asc' THEN p.updated_at END ASC,
    CASE WHEN p_sort_by='updatedAt' AND p_sort_direction='desc' THEN p.updated_at END DESC,
    CASE WHEN p_sort_by='documentNumber' AND p_sort_direction='asc' THEN pg_catalog.lower(p.document_number) END ASC,
    CASE WHEN p_sort_by='documentNumber' AND p_sort_direction='desc' THEN pg_catalog.lower(p.document_number) END DESC,
    CASE WHEN p_sort_by='documentType' AND p_sort_direction='asc' THEN pg_catalog.lower(p.document_type) END ASC,
    CASE WHEN p_sort_by='documentType' AND p_sort_direction='desc' THEN pg_catalog.lower(p.document_type) END DESC,
    CASE WHEN p_sort_by='revision' AND p_sort_direction='asc' THEN p.revision END ASC,
    CASE WHEN p_sort_by='revision' AND p_sort_direction='desc' THEN p.revision END DESC,
    CASE WHEN p_sort_direction='asc' THEN p.id END ASC,
    CASE WHEN p_sort_direction='desc' THEN p.id END DESC
   ) rn
  FROM page_rows p
 )
 SELECT pg_catalog.jsonb_build_object(
  'rows',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'documentId',r.id,'boardItemId',r.board_item_id,
   'documentType',r.document_type,'documentNumber',r.document_number,
   'clientName',r.content->>'customerName',
   'referenceNumber',r.content->>'referenceNumber',
   'poNumber',r.content->>'poNumber',
   'revision',r.revision,'workflowState',r.workflow_state,
   'approvalPolicy',private.tl03_revision_approval_policy(r.id,r.revision),
   'archived',r.archived_at IS NOT NULL,'hidden',r.hidden_at IS NOT NULL,
   'createdAt',r.created_at,'updatedAt',r.updated_at,
   'createdBy',r.created_by,
   'createdByName',coalesce(NULLIF(pg_catalog.btrim(creator_profile.display_name),''),
    NULLIF(pg_catalog.btrim(creator_profile.email),'')),
   'createdByActor',r.created_by=v_actor,
   'assignedStage',CASE
    WHEN v_can_review AND v_actor_email=r.primary_email THEN 'primary'
    WHEN v_can_review AND v_actor_email=r.secondary_email THEN 'secondary'
    ELSE NULL END,
   'primaryAt',CASE WHEN v_can_review AND v_actor_email IN
    (r.primary_email,r.secondary_email) THEN primary_review.recorded_at ELSE NULL END,
   'secondaryAt',CASE WHEN v_can_review AND v_actor_email IN
    (r.primary_email,r.secondary_email) THEN secondary_review.recorded_at ELSE NULL END
  ) ORDER BY r.rn) FILTER(WHERE r.rn<=p_limit),'[]'::jsonb),
  'hasMore',pg_catalog.count(*)>p_limit,
  'nextCursor',CASE WHEN pg_catalog.count(*)>p_limit THEN
   (SELECT pg_catalog.jsonb_build_object(
     'sortBy',p_sort_by,
     'sortValue',CASE p_sort_by
      WHEN 'createdAt' THEN last.created_at::text
      WHEN 'updatedAt' THEN last.updated_at::text
      WHEN 'documentNumber' THEN pg_catalog.lower(last.document_number)
      WHEN 'documentType' THEN pg_catalog.lower(last.document_type)
      WHEN 'revision' THEN last.revision::text
     END,
     'documentId',last.id)
    FROM ranked last WHERE last.rn=p_limit)
   ELSE NULL END,
  'totalCount',(SELECT pg_catalog.count(*) FROM matching)
 ) INTO result
 FROM ranked r
 LEFT JOIN private.tradelink_document_reviews primary_review
  ON primary_review.document_id=r.id
  AND primary_review.document_revision=r.revision AND primary_review.stage='primary'
 LEFT JOIN private.tradelink_document_reviews secondary_review
  ON secondary_review.document_id=r.id
  AND secondary_review.document_revision=r.revision AND secondary_review.stage='secondary'
 LEFT JOIN public.profiles creator_profile ON creator_profile.id=r.created_by;

 RETURN result;
END $repository$;

REVOKE ALL ON FUNCTION private.tl03_documents_query(
 uuid,text,text,text,text,text,date,date,text,text,jsonb,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_documents_query(
 uuid,text,text,text,text,text,date,date,text,text,jsonb,integer
) TO authenticated;

CREATE FUNCTION public.tl03_documents_query(
 p_board_id uuid,
 p_search text,
 p_document_type text,
 p_workflow_state text,
 p_archive_mode text,
 p_visibility_mode text,
 p_updated_from date,
 p_updated_to date,
 p_sort_by text,
 p_sort_direction text,
 p_cursor jsonb,
 p_limit integer
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $repository_rpc$
 SELECT private.tl03_documents_query(
  p_board_id,p_search,p_document_type,p_workflow_state,p_archive_mode,
  p_visibility_mode,p_updated_from,p_updated_to,p_sort_by,p_sort_direction,
  p_cursor,p_limit
 );
$repository_rpc$;

REVOKE ALL ON FUNCTION public.tl03_documents_query(
 uuid,text,text,text,text,text,date,date,text,text,jsonb,integer
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_documents_query(
 uuid,text,text,text,text,text,date,date,text,text,jsonb,integer
) TO authenticated;

DO $postflight$
BEGIN
 IF NOT has_function_privilege('authenticated',
     'private.tl03_documents_query(uuid,text,text,text,text,text,date,date,text,text,jsonb,integer)','EXECUTE')
  OR has_function_privilege('anon',
     'private.tl03_documents_query(uuid,text,text,text,text,text,date,date,text,text,jsonb,integer)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
     'public.tl03_documents_query(uuid,text,text,text,text,text,date,date,text,text,jsonb,integer)','EXECUTE')
  OR has_function_privilege('anon',
     'public.tl03_documents_query(uuid,text,text,text,text,text,date,date,text,text,jsonb,integer)','EXECUTE')
  OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid='private.tl03_documents_query(uuid,text,text,text,text,text,date,date,text,text,jsonb,integer)'::regprocedure
    AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[]
  )
  OR NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid='public.tl03_documents_query(uuid,text,text,text,text,text,date,date,text,text,jsonb,integer)'::regprocedure
    AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[]
  )
 THEN RAISE EXCEPTION 'CP-TL-OPT-01 repository RPC permission or execution posture drift'
  USING ERRCODE='42501'; END IF;
END $postflight$;

COMMIT;