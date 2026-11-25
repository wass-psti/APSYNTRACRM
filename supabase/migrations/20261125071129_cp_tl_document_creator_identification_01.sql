-- CP-TL-DOCUMENT-CREATOR-01
-- Resolve original document creator identity from created_by + public.profiles.
-- Do not add mutable creator fields or change existing save/revision workflows.
BEGIN;

DO $preflight$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.profiles') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('private.tl03_can_read_own_document(uuid,uuid)') IS NULL
  OR to_regprocedure('private.tl03_documents_page(uuid,text,text,text,text,text,timestamptz,uuid,integer)') IS NULL
  OR to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL
  OR to_regprocedure('public.tl03_document_revision_bundle(uuid,uuid,bigint)') IS NULL
  OR to_regprocedure('private.tl03_document_creator_name(uuid,uuid)') IS NOT NULL
  OR md5(pg_get_functiondef('private.tl03_documents_page(uuid,text,text,text,text,text,timestamp with time zone,uuid,integer)'::regprocedure))
   IS DISTINCT FROM '2f9a54b51a395777347ead0c7e659ff8'
  OR md5(pg_get_functiondef('public.tl03_document_revision_bundle(uuid,uuid,bigint)'::regprocedure))
   IS DISTINCT FROM 'd6ea272a1fc4dfd05a54a340de69cf59'
  OR md5(pg_get_functiondef('public.tl03_document_read(uuid,uuid)'::regprocedure))
   IS DISTINCT FROM '0345b7dd1d90289101358a0c4331bd72'
  OR NOT EXISTS(SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles' AND column_name='display_name')
  OR NOT EXISTS(SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles' AND column_name='email')
 THEN RAISE EXCEPTION 'TradeLink creator identity prerequisites or duplicate installation detected'
  USING ERRCODE='55000'; END IF;
END $preflight$;

CREATE FUNCTION private.tl03_document_creator_name(p_board_id uuid,p_document_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $creator$
DECLARE creator_name text;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  AND private.tl03_can_read_own_document(p_board_id,p_document_id) IS DISTINCT FROM TRUE
 THEN
  RAISE EXCEPTION 'Signed TradeLink document read denied' USING ERRCODE='42501';
 END IF;

 SELECT coalesce(NULLIF(pg_catalog.btrim(p.display_name),''),
  NULLIF(pg_catalog.btrim(p.email),'')) INTO creator_name
 FROM public.tradelink_documents d
 LEFT JOIN public.profiles p ON p.id=d.created_by
 WHERE d.board_id=p_board_id AND d.id=p_document_id AND d.deleted_at IS NULL;
 RETURN creator_name;
END $creator$;
REVOKE ALL ON FUNCTION private.tl03_document_creator_name(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_document_creator_name(uuid,uuid)
 TO authenticated;
COMMENT ON FUNCTION private.tl03_document_creator_name(uuid,uuid)
 IS 'Returns the immutable TradeLink document creator profile name only when the caller can already read that document.';

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
  AND secondary_review.document_revision=r.revision AND secondary_review.stage='secondary'
 LEFT JOIN public.profiles creator_profile ON creator_profile.id=r.created_by;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.tl03_document_revision_bundle(
 p_board_id uuid,p_document_id uuid,p_revision bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $bundle$
DECLARE
 d public.tradelink_documents%rowtype;
 v_snapshot private.tradelink_document_revision_snapshots%rowtype;
 v_revisions jsonb;
 v_selected jsonb;
 v_target_revision bigint;
 v_approved boolean:=FALSE;
 v_primary_at timestamptz;
 v_secondary_at timestamptz;
 v_creator_name text;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  AND private.tl03_can_read_own_document(p_board_id,p_document_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink revision read denied'
  USING ERRCODE='42501'; END IF;
 IF p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR p_document_id IS NULL OR (p_revision IS NOT NULL AND p_revision<1)
 THEN RAISE EXCEPTION 'Invalid TradeLink revision history request' USING ERRCODE='22023'; END IF;

 SELECT * INTO d FROM public.tradelink_documents
 WHERE id=p_document_id AND board_id=p_board_id
  AND workspace_id=public.current_workspace_id(auth.uid());
 IF d.id IS NULL THEN RETURN NULL; END IF;

 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'revision',s.revision,
   'workflowState',CASE WHEN coalesce(a.approved,FALSE) THEN 'approved' ELSE s.workflow_state END,
   'approved',coalesce(a.approved,FALSE),'approvalPolicy',private.tl03_revision_approval_policy(s.document_id,s.revision),'primaryAt',a.primary_at,
   'secondaryAt',a.secondary_at,'revisionAt',s.revision_at,
   'capturedAt',s.captured_at,'snapshotSource',s.snapshot_source,
   'current',s.revision=d.revision
  ) ORDER BY s.revision DESC),'[]'::jsonb) INTO v_revisions
 FROM private.tradelink_document_revision_snapshots s
 LEFT JOIN LATERAL(
  SELECT
   private.tl03_approval_evidence_complete(s.document_id,s.revision) AS approved,
   min(r.recorded_at) FILTER(WHERE r.stage='primary') AS primary_at,
   min(r.recorded_at) FILTER(WHERE r.stage='secondary') AS secondary_at
  FROM private.tradelink_document_reviews r
  LEFT JOIN auth.users u ON u.id=r.actor_id
  WHERE r.document_id=s.document_id AND r.document_revision=s.revision
 ) a ON TRUE
 WHERE s.document_id=d.id;

 v_target_revision:=coalesce(p_revision,d.revision);
 SELECT * INTO v_snapshot FROM private.tradelink_document_revision_snapshots
 WHERE document_id=d.id AND revision=v_target_revision;
 IF v_snapshot.document_id IS NOT NULL THEN
  SELECT coalesce(NULLIF(pg_catalog.btrim(p.display_name),''),
   NULLIF(pg_catalog.btrim(p.email),'')) INTO v_creator_name
  FROM public.profiles p WHERE p.id=v_snapshot.created_by;

  SELECT
   private.tl03_approval_evidence_complete(v_snapshot.document_id,v_snapshot.revision),
   min(r.recorded_at) FILTER(WHERE r.stage='primary'),
   min(r.recorded_at) FILTER(WHERE r.stage='secondary')
  INTO v_approved,v_primary_at,v_secondary_at
  FROM private.tradelink_document_reviews r
  LEFT JOIN auth.users u ON u.id=r.actor_id
  WHERE r.document_id=v_snapshot.document_id AND r.document_revision=v_snapshot.revision;

  v_selected:=pg_catalog.jsonb_build_object(
   'id',v_snapshot.document_id,'board_id',v_snapshot.board_id,'workspace_id',v_snapshot.workspace_id,
   'board_item_id',v_snapshot.board_item_id,'document_type',v_snapshot.document_type,
   'document_number',v_snapshot.document_number,
   'workflow_state',CASE WHEN v_approved THEN 'approved' ELSE v_snapshot.workflow_state END,
   'revision',v_snapshot.revision,'content',v_snapshot.content,'created_by',v_snapshot.created_by,
   'created_by_name',v_creator_name,'updated_by',v_snapshot.updated_by,'created_at',v_snapshot.created_at,'updated_at',v_snapshot.updated_at,
   'archived_at',v_snapshot.archived_at,'snapshot_source',v_snapshot.snapshot_source,
   'revision_at',v_snapshot.revision_at,'approved',v_approved,
   'approval_policy',private.tl03_revision_approval_policy(v_snapshot.document_id,v_snapshot.revision),
   'primary_reviewed_at',v_primary_at,'secondary_reviewed_at',v_secondary_at
  );
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'documentId',d.id,'boardItemId',d.board_item_id,
  'currentRevision',d.revision,'revisions',v_revisions,'selected',v_selected
 );
END $bundle$;

CREATE OR REPLACE FUNCTION public.tl03_document_read(p_board_id uuid,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $read$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
  AND private.tl03_can_read_own_document(p_board_id,p_document_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink document read denied' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.to_jsonb(d) || pg_catalog.jsonb_build_object(
   'created_by_name',private.tl03_document_creator_name(p_board_id,p_document_id)
  ) INTO result
 FROM public.tradelink_documents d
 WHERE d.board_id=p_board_id AND d.id=p_document_id AND d.deleted_at IS NULL;
 RETURN result;
END $read$;

DO $postflight$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid='private.tl03_document_creator_name(uuid,uuid)'::regprocedure
   AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
   AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid='private.tl03_documents_page(uuid,text,text,text,text,text,timestamp with time zone,uuid,integer)'::regprocedure
    AND p.prosecdef AND pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid),'createdByName')>0)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid='public.tl03_document_revision_bundle(uuid,uuid,bigint)'::regprocedure
    AND p.prosecdef AND pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid),'created_by_name')>0)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid='public.tl03_document_read(uuid,uuid)'::regprocedure
    AND NOT p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}'
    AND pg_catalog.strpos(pg_catalog.pg_get_functiondef(p.oid),'created_by_name')>0)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid='private.tl03_documents_page(uuid,text,text,text,text,text,timestamp with time zone,uuid,integer)'::regprocedure
    AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid='public.tl03_document_revision_bundle(uuid,uuid,bigint)'::regprocedure
    AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}')
 THEN RAISE EXCEPTION 'TradeLink creator identity postflight failed' USING ERRCODE='55000'; END IF;
END $postflight$;

COMMIT;
