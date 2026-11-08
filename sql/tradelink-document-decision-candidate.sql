-- TradeLink signed final approval/rejection, source-only production candidate.
-- DO NOT APPLY TO PRODUCTION without separately scoped database authorization.
-- Requires the submitted and review/revision candidate RPCs to exist.
-- Does not activate actions in the frontend and makes no change to existing
-- document content, RLS, roles, or Storage.
BEGIN;
DO $tl_decide_preflight$
DECLARE c text; f pg_catalog.pg_proc%rowtype;
BEGIN
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO c
 FROM pg_catalog.pg_constraint
 WHERE conrelid='public.tradelink_document_events'::regclass
  AND conname='tradelink_document_events_operation_check';
 SELECT * INTO f FROM pg_catalog.pg_proc
 WHERE oid=to_regprocedure('private.tl03_review(uuid,uuid,bigint,text,text)');
 IF c IS DISTINCT FROM
   'CHECK ((operation = ANY (ARRAY[''created''::text, ''updated''::text, ''archived''::text, ''restored''::text, ''submitted''::text, ''completed''::text, ''reviewed''::text, ''revision-requested''::text])))'
 OR f.oid IS NULL OR pg_catalog.pg_get_userbyid(f.proowner)<>'postgres'
 OR NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
 OR f.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
 OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
 OR to_regprocedure('public.tl03_document_submit(uuid,uuid,bigint)') IS NULL
 OR to_regprocedure('public.tl03_document_history(uuid,uuid,integer)') IS NULL
 OR to_regprocedure('public.tl03_document_review(uuid,uuid,bigint,text,text)') IS NULL
 OR to_regprocedure('private.tl03_decide(uuid,uuid,bigint,text,text)') IS NOT NULL
 OR to_regprocedure('public.tl03_document_decide(uuid,uuid,bigint,text,text)') IS NOT NULL
 OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
 OR has_function_privilege('anon',f.oid,'EXECUTE')
 OR NOT has_function_privilege('authenticated',
    'public.tl03_document_review(uuid,uuid,bigint,text,text)','EXECUTE')
 OR has_function_privilege('anon',
    'public.tl03_document_review(uuid,uuid,bigint,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink approval candidate prerequisites, grants or audit contract drift'
  USING ERRCODE='42501'; END IF;
END $tl_decide_preflight$;

-- Extend the immutable event operation vocabulary by exactly two decisions.
ALTER TABLE public.tradelink_document_events
 DROP CONSTRAINT tradelink_document_events_operation_check;
ALTER TABLE public.tradelink_document_events
 ADD CONSTRAINT tradelink_document_events_operation_check
 CHECK(operation IN ('created','updated','archived','restored',
   'submitted','completed','reviewed','revision-requested','approved','rejected'));

CREATE FUNCTION private.tl03_decide(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,
 p_action text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $tl_decide$
DECLARE
 actor uuid:=auth.uid();d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;
 email text;reviewer_email text;approver_email text;
 prior_state text;target text;rev bigint;modified_at timestamptz;
 reason text:=pg_catalog.btrim(coalesce(p_reason,''));
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink General Manager required'
  USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
  OR p_action IS NULL OR p_action NOT IN ('approve','reject')
  OR (p_reason IS NOT NULL AND
   (pg_catalog.char_length(p_reason)>1500 OR p_reason~'[[:cntrl:]]'))
  OR (p_action='reject' AND pg_catalog.char_length(reason) NOT BETWEEN 3 AND 1500)
 THEN RAISE EXCEPTION 'Invalid TradeLink approval/rejection command or reason'
  USING ERRCODE='22023'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO email
 FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL;
 IF email IS NULL OR email='' THEN
  RAISE EXCEPTION 'Verified signed decision-maker account required'
  USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.tradelink_documents
 WHERE id=p_document_id AND board_id=p_board_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
  OR d.revision IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'Stale or foreign TradeLink decision'
  USING ERRCODE='PT409'; END IF;
 IF d.archived_at IS NOT NULL OR d.workflow_state NOT IN ('submitted','under-review')
  OR d.document_type='packing'
 THEN RAISE EXCEPTION 'Document is not in an approvable or rejectable workflow state'
  USING ERRCODE='PT409'; END IF;
 reviewer_email:=pg_catalog.lower(pg_catalog.btrim(coalesce(
   d.content->>'verifiedByEmail','')));
 approver_email:=pg_catalog.lower(pg_catalog.btrim(coalesce(
   d.content->>'approvedByEmail','')));
 IF p_action='approve' THEN
  -- Source requires approval only for priced/commercial documents. Physical
  -- Delivery and Payment completion requires separate verified timestamps.
  IF d.document_type NOT IN ('quotation','po','esi') OR
   pg_catalog.btrim(coalesce(d.content->>'approvedBy',''))='' OR
   approver_email='' OR email IS DISTINCT FROM approver_email
  THEN RAISE EXCEPTION 'Signed assigned approver required'
   USING ERRCODE='42501'; END IF;
  -- If source names a verifier, approval requires an actual signed review.
  -- A free-text verifiedBy alone never counts as proof of review.
  IF pg_catalog.btrim(coalesce(d.content->>'verifiedBy',''))<>'' THEN
   IF d.workflow_state<>'under-review' OR reviewer_email='' OR
    NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
      JOIN auth.users reviewer ON reviewer.id=e.actor_id
      WHERE e.document_id=d.id AND e.board_id=p_board_id
       AND e.workspace_id=d.workspace_id AND e.revision=d.revision
       AND e.operation='reviewed'
       AND reviewer.email_confirmed_at IS NOT NULL
       AND pg_catalog.lower(pg_catalog.btrim(reviewer.email))=reviewer_email)
   THEN RAISE EXCEPTION 'Signed assigned review required before approval'
    USING ERRCODE='42501'; END IF;
  END IF;
 ELSE
  IF email IS DISTINCT FROM reviewer_email AND
    email IS DISTINCT FROM approver_email
  THEN RAISE EXCEPTION 'Only the signed assigned reviewer or approver may reject'
   USING ERRCODE='42501'; END IF;
 END IF;
 SELECT * INTO projection FROM public.work_board_items
 WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL
  OR projection.title IS DISTINCT FROM d.document_number
 THEN RAISE EXCEPTION 'TradeLink Board decision projection changed'
  USING ERRCODE='PT409'; END IF;
 prior_state:=d.workflow_state;
 target:=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END;
 UPDATE public.tradelink_documents
 SET workflow_state=target,revision=revision+1,updated_by=actor,
     updated_at=pg_catalog.clock_timestamp()
 WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
 UPDATE public.work_board_items
 SET updated_by=actor,updated_at=modified_at
 WHERE id=d.board_item_id AND board_id=p_board_id
  AND title=d.document_number AND archived_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'TradeLink Board decision projection changed'
   USING ERRCODE='PT409'; END IF;
 INSERT INTO public.tradelink_document_events(
  document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES(d.id,p_board_id,d.workspace_id,rev,
  CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END,
  actor,pg_catalog.jsonb_build_object(
    'action',p_action,'from',prior_state,'to',target,'reason',reason,
    'decidedAt',modified_at,'documentType',d.document_type));
 PERFORM public.work_board_log(p_board_id,'tradelink.workflow.'||p_action,
  'TradeLink signed decision committed','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object(
   'revision',rev,'from',prior_state,'to',target));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'revision',rev,
  'state',target,'operation',p_action,'from',prior_state);
END $tl_decide$;
REVOKE ALL ON FUNCTION private.tl03_decide(uuid,uuid,bigint,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_decide(uuid,uuid,bigint,text,text)
 TO authenticated;

CREATE FUNCTION public.tl03_document_decide(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,
 p_action text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $tl_rpc$
 SELECT private.tl03_decide(p_board_id,p_document_id,p_expected_revision,p_action,p_reason);
$tl_rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_decide(uuid,uuid,bigint,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_decide(uuid,uuid,bigint,text,text)
 TO authenticated;

DO $tl_decide_postflight$
DECLARE f pg_catalog.pg_proc%rowtype;
BEGIN
 SELECT * INTO f FROM pg_catalog.pg_proc
 WHERE oid='private.tl03_decide(uuid,uuid,bigint,text,text)'::regprocedure;
 IF f.oid IS NULL OR NOT f.prosecdef
  OR pg_catalog.pg_get_userbyid(f.proowner)<>'postgres'
  OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR f.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  OR has_function_privilege('anon',f.oid,'EXECUTE')
  OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_document_decide(uuid,uuid,bigint,text,text)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_document_decide(uuid,uuid,bigint,text,text)','EXECUTE')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
    p.oid='public.tl03_document_decide(uuid,uuid,bigint,text,text)'::regprocedure
     AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
 THEN RAISE EXCEPTION 'TradeLink approval decision grant/search path drift'
  USING ERRCODE='42501'; END IF;
END $tl_decide_postflight$;
COMMIT;
