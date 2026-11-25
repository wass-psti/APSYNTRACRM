-- Preserve existing listing visibility; report the recorded approval policy.
CREATE OR REPLACE FUNCTION private.tl03_documents_page(p_board_id uuid, p_search text, p_document_type text, p_workflow_state text, p_archive_mode text, p_visibility_mode text, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   'approvalPolicy',private.tl03_revision_approval_policy(r.id,r.revision),
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
END $function$;

CREATE OR REPLACE FUNCTION private.tl03_assigned_documents(p_board_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   d.workflow_state,d.archived_at,d.created_at,d.updated_at,d.content,
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
  'approvalPolicy',private.tl03_revision_approval_policy(a.id,a.revision),
  'archived',a.archived_at IS NOT NULL,'updatedAt',a.updated_at,'createdAt',a.created_at,
  'clientName',a.content->>'customerName',
  'primaryEmail',a.primary_email,'secondaryEmail',a.secondary_email,
  'primaryAt',a.primary_at,'secondaryAt',a.secondary_at,
  'assignedStage',CASE WHEN actor_email=a.primary_email THEN 'primary'
   WHEN actor_email=a.secondary_email THEN 'secondary' ELSE NULL END
 ) ORDER BY a.updated_at DESC,a.id DESC),'[]'::jsonb) INTO result FROM assigned a;
 RETURN result;
END $function$;
