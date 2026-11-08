-- TradeLink genuine signed review/revision request + revision-required editing.
-- SOURCE-ONLY CANDIDATE. Do NOT run on production without separate exact-scope
-- authorization. Requires the signed submit candidate to be installed first.
-- Preserves existing authorizations, RLS, Board and immutable audit constraints.
-- Source reviewer/approver names alone are NEVER evidence of account assignment.
BEGIN;
DO $tl_review_preflight$
DECLARE f pg_catalog.pg_proc%rowtype; actual text;
BEGIN
 SELECT * INTO f FROM pg_catalog.pg_proc
 WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure;
 SELECT pg_catalog.pg_get_constraintdef(c.oid) INTO actual
 FROM pg_catalog.pg_constraint c WHERE c.conrelid='public.tradelink_document_events'::regclass
  AND c.conname='tradelink_document_events_operation_check';
 IF actual IS DISTINCT FROM
    'CHECK ((operation = ANY (ARRAY[''created''::text, ''updated''::text, ''archived''::text, ''restored''::text, ''submitted''::text, ''completed''::text])))'
  OR f.oid IS NULL OR pg_catalog.pg_get_userbyid(f.proowner)<>'postgres'
  OR NOT f.prosecdef OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR pg_catalog.md5(pg_catalog.pg_get_functiondef(f.oid))<>'022f93c81d7e315891e9596e24335350'
  OR f.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('public.tl03_document_submit(uuid,uuid,bigint)') IS NULL
  OR to_regprocedure('private.tl03_review(uuid,uuid,bigint,text,text)') IS NOT NULL
  OR to_regprocedure('public.tl03_document_review(uuid,uuid,bigint,text,text)') IS NOT NULL
  OR to_regprocedure('public.tl03_document_history(uuid,uuid,integer)') IS NOT NULL
  OR NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='auth' AND table_name='users' AND column_name='email_confirmed_at')
  OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
  OR has_function_privilege('anon',f.oid,'EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink review prerequisite, function, identity or audit constraint drift'
  USING ERRCODE='42501'; END IF;
END $tl_review_preflight$;

ALTER TABLE public.tradelink_document_events
 DROP CONSTRAINT tradelink_document_events_operation_check;
ALTER TABLE public.tradelink_document_events
 ADD CONSTRAINT tradelink_document_events_operation_check
 CHECK(operation IN ('created','updated','archived','restored',
   'submitted','completed','reviewed','revision-requested'));

CREATE OR REPLACE FUNCTION private.tl03_commit(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_operation text,p_data jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $commit$
DECLARE actor uuid:=auth.uid(); d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype; payload jsonb;
 group_id uuid; item_id uuid; rev bigint; modified_at timestamptz;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink General Manager access required' USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0
  OR p_operation IS NULL OR p_operation NOT IN ('create','update','archive','restore') THEN
  RAISE EXCEPTION 'Invalid document command' USING ERRCODE='22023'; END IF;
 IF p_operation IN ('create','update') THEN payload:=private.tl03_validate_draft(p_data);
 ELSIF p_data IS NOT NULL THEN
  RAISE EXCEPTION 'Archive/restore cannot mutate fields' USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM public.tradelink_documents WHERE id=p_document_id FOR UPDATE;
 IF p_operation='create' THEN
  IF p_expected_revision<>0 THEN
   RAISE EXCEPTION 'Creation requires revision zero' USING ERRCODE='PT409'; END IF;
  IF d.id IS NOT NULL THEN
   IF d.board_id=p_board_id AND d.created_by=actor AND d.revision=1
    AND d.workflow_state='draft' AND d.archived_at IS NULL AND d.content=payload
    AND EXISTS(SELECT 1 FROM public.work_board_items i
      WHERE i.id=d.board_item_id AND i.board_id=p_board_id
        AND i.title=d.document_number AND i.archived_at IS NULL) THEN
    RETURN pg_catalog.jsonb_build_object('documentId',d.id,'boardItemId',d.board_item_id,
     'revision',1,'state','draft','operation','create','idempotent',true);
   END IF;
   RAISE EXCEPTION 'Existing document ID conflict' USING ERRCODE='PT409'; END IF;
  SELECT id INTO group_id FROM public.work_board_groups
   WHERE board_id=p_board_id ORDER BY position,id LIMIT 1;
  IF group_id IS NULL THEN
   RAISE EXCEPTION 'Existing TradeLink main group missing' USING ERRCODE='42501'; END IF;
  item_id:=public.wm_add_board_item(p_board_id,group_id,payload->>'documentNumber');
  INSERT INTO public.tradelink_documents
   (id,board_id,workspace_id,board_item_id,document_type,document_number,
    workflow_state,revision,content,created_by,updated_by)
  VALUES(p_document_id,p_board_id,public.current_workspace_id(actor),item_id,
   payload->>'documentType',payload->>'documentNumber','draft',1,payload,actor,actor);
  rev:=1;
 ELSE
  IF d.id IS NULL OR d.board_id IS DISTINCT FROM p_board_id
   OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
   OR d.revision IS DISTINCT FROM p_expected_revision THEN
   RAISE EXCEPTION 'Document stale revision or foreign workspace' USING ERRCODE='PT409'; END IF;
  IF d.workflow_state<>'draft' AND
    (d.workflow_state<>'revision-required' OR p_operation<>'update') THEN
   RAISE EXCEPTION 'Workflow transitions require separate signed domain API' USING ERRCODE='42501'; END IF;
  SELECT * INTO projection FROM public.work_board_items
   WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
  IF projection.id IS NULL OR projection.title IS DISTINCT FROM d.document_number
   OR (projection.archived_at IS NULL) IS DISTINCT FROM (d.archived_at IS NULL) THEN
   RAISE EXCEPTION 'Board projection drift; reconcile first' USING ERRCODE='PT409'; END IF;
  IF p_operation='update' THEN
   IF d.archived_at IS NOT NULL OR payload->>'documentType'<>d.document_type THEN
    RAISE EXCEPTION 'Draft type or archived state cannot be changed' USING ERRCODE='42501'; END IF;
   IF payload->>'documentNumber' IS DISTINCT FROM d.document_number THEN
    PERFORM public.wm_set_board_cell_if_current(d.board_item_id,NULL,
     pg_catalog.to_jsonb(payload->>'documentNumber'),pg_catalog.to_jsonb(d.document_number));
   END IF;
   UPDATE public.tradelink_documents
    SET document_number=payload->>'documentNumber',content=payload,
     revision=revision+1,updated_by=actor,updated_at=pg_catalog.clock_timestamp()
    WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
   -- Same signed transaction and locked Board item: reflect each revision,
   -- even when the document number (Board title) is unchanged.
   UPDATE public.work_board_items
    SET updated_by=actor,updated_at=modified_at
    WHERE id=d.board_item_id AND board_id=p_board_id
      AND title=payload->>'documentNumber' AND archived_at IS NULL;
   IF NOT FOUND THEN
    RAISE EXCEPTION 'Board projection changed during document update'
     USING ERRCODE='PT409'; END IF;
  ELSIF p_operation='archive' THEN
   IF d.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already archived' USING ERRCODE='PT409'; END IF;
   PERFORM public.wm_set_board_item_archived(d.board_item_id,true);
   UPDATE public.tradelink_documents SET archived_at=pg_catalog.clock_timestamp(),
    revision=revision+1,updated_by=actor,updated_at=pg_catalog.clock_timestamp()
    WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
  ELSE
   IF d.archived_at IS NULL THEN RAISE EXCEPTION 'Not archived' USING ERRCODE='PT409'; END IF;
   PERFORM public.wm_set_board_item_archived(d.board_item_id,false);
   UPDATE public.tradelink_documents SET archived_at=NULL,
    revision=revision+1,updated_by=actor,updated_at=pg_catalog.clock_timestamp()
    WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
  END IF;
  IF p_operation IN ('archive','restore') THEN
   UPDATE public.work_board_items
    SET updated_by=actor,updated_at=modified_at
    WHERE id=d.board_item_id AND board_id=p_board_id
      AND title=d.document_number
      AND (archived_at IS NOT NULL)=(p_operation='archive');
   IF NOT FOUND THEN
    RAISE EXCEPTION 'Board projection changed during document lifecycle update'
     USING ERRCODE='PT409'; END IF;
  END IF;
  item_id:=d.board_item_id;
 END IF;
 INSERT INTO public.tradelink_document_events
  (document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES(p_document_id,p_board_id,public.current_workspace_id(actor),rev,
  CASE p_operation WHEN 'create' THEN 'created' WHEN 'update' THEN 'updated'
   WHEN 'archive' THEN 'archived' ELSE 'restored' END,actor,
  pg_catalog.jsonb_build_object('documentType',CASE WHEN p_operation='create'
   THEN payload->>'documentType' ELSE d.document_type END));
 PERFORM public.work_board_log(p_board_id,'tradelink.document.'||p_operation,
  'TradeLink draft revision committed','tradelink-document',p_document_id::text,
  pg_catalog.jsonb_build_object('revision',rev,'operation',p_operation));
 RETURN pg_catalog.jsonb_build_object('documentId',p_document_id,'boardItemId',item_id,
  'revision',rev,'state',CASE WHEN p_operation='update' AND d.id IS NOT NULL THEN
    d.workflow_state ELSE 'draft' END,'operation',p_operation,'idempotent',false);
END $commit$;

-- Only the existing signed General Manager Board manager can act, and
-- only when their server-confirmed email matches a saved reviewer/approver
-- account address. Free-text display names never grant permissions.
CREATE FUNCTION private.tl03_review(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,
 p_action text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $tl_review$
DECLARE
 actor uuid:=auth.uid();d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;
 email text;reviewer_email text;approver_email text;
 reason text:=pg_catalog.btrim(coalesce(p_reason,''));prior_state text;
 target text;rev bigint;modified_at timestamptz;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink manager scope required'
  USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
 OR p_action IS NULL OR p_action NOT IN ('review','request-revision')
 OR p_reason IS NOT NULL AND (pg_catalog.char_length(p_reason)>1500 OR p_reason~'[[:cntrl:]]')
 OR (p_action='request-revision' AND pg_catalog.char_length(reason) NOT BETWEEN 3 AND 1500)
 THEN RAISE EXCEPTION 'Invalid TradeLink review action or revision reason'
  USING ERRCODE='22023'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO email
  FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL;
 IF email IS NULL OR email='' THEN
  RAISE EXCEPTION 'Verified reviewer account identity required'
  USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
  OR d.revision IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'Stale or foreign TradeLink review'
  USING ERRCODE='PT409'; END IF;
 IF d.archived_at IS NOT NULL OR d.workflow_state NOT IN ('submitted','under-review')
 THEN RAISE EXCEPTION 'Document is not in a reviewable workflow state'
  USING ERRCODE='PT409'; END IF;
 IF p_action='review' AND
   (d.workflow_state<>'submitted' OR d.document_type NOT IN
     ('esi','quotation','po','payment') OR
     pg_catalog.btrim(coalesce(d.content->>'verifiedBy',''))='')
 THEN RAISE EXCEPTION 'No source-defined review available for this document'
  USING ERRCODE='42501'; END IF;
 reviewer_email:=pg_catalog.lower(pg_catalog.btrim(coalesce(
  d.content->>'verifiedByEmail','')));
 approver_email:=pg_catalog.lower(pg_catalog.btrim(coalesce(
  d.content->>'approvedByEmail','')));
 IF p_action='review' AND
   (reviewer_email='' OR email IS DISTINCT FROM reviewer_email) OR
   p_action='request-revision' AND
   (email IS DISTINCT FROM reviewer_email AND email IS DISTINCT FROM approver_email)
 THEN RAISE EXCEPTION 'Only the signed, assigned reviewer or approver may act'
  USING ERRCODE='42501'; END IF;
 -- Guard only the same document-linked Board row. Never create or silently
 -- overwrite a secondary Board row to represent a workflow transition.
 SELECT * INTO projection FROM public.work_board_items
  WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL OR
  projection.title IS DISTINCT FROM d.document_number THEN
  RAISE EXCEPTION 'TradeLink Board review projection changed'
   USING ERRCODE='PT409'; END IF;
 prior_state:=d.workflow_state;
 target:=CASE WHEN p_action='review' THEN 'under-review'
   ELSE 'revision-required' END;
 UPDATE public.tradelink_documents
  SET workflow_state=target,revision=revision+1,updated_by=actor,
      updated_at=pg_catalog.clock_timestamp()
  WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
 UPDATE public.work_board_items
  SET updated_by=actor,updated_at=modified_at
  WHERE id=d.board_item_id AND board_id=p_board_id
    AND title=d.document_number AND archived_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'TradeLink Board review projection changed'
   USING ERRCODE='PT409'; END IF;
 INSERT INTO public.tradelink_document_events
   (document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES (d.id,p_board_id,d.workspace_id,rev,
  CASE WHEN p_action='review' THEN 'reviewed' ELSE 'revision-requested' END,
  actor,pg_catalog.jsonb_build_object('action',p_action,'from',prior_state,
    'to',target,'reason',reason,'documentType',d.document_type));
 PERFORM public.work_board_log(p_board_id,'tradelink.workflow.'||p_action,
  'TradeLink signed workflow decision','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',rev,'from',prior_state,'to',target));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'revision',rev,'state',target,
  'operation',p_action,'from',prior_state);
END $tl_review$;
REVOKE ALL ON FUNCTION private.tl03_review(uuid,uuid,bigint,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_review(uuid,uuid,bigint,text,text)
 TO authenticated;

CREATE FUNCTION public.tl03_document_review(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,
 p_action text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $tl_rpc$
 SELECT private.tl03_review(
  p_board_id,p_document_id,p_expected_revision,p_action,p_reason);
$tl_rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_review(uuid,uuid,bigint,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_review(uuid,uuid,bigint,text,text)
 TO authenticated;

-- Read-only signed audit/history endpoint. Reveals only existing RLS-authorized
-- document events; exposes no auth identity table or independent role grants.
CREATE FUNCTION public.tl03_document_history(
 p_board_id uuid,p_document_id uuid,p_limit integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $tl_history$
DECLARE events jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink history denied'
  USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Invalid TradeLink history limit'
  USING ERRCODE='22023'; END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(
  pg_catalog.jsonb_build_object('revision',s.revision,'operation',s.operation,
   'actorId',s.actor_id,'at',s.at,'metadata',s.metadata)
  ORDER BY s.revision DESC),'[]'::jsonb) INTO events
 FROM (SELECT e.revision,e.operation,e.actor_id,e.at,e.metadata
  FROM public.tradelink_document_events e
  WHERE e.board_id=p_board_id AND e.document_id=p_document_id
   AND e.workspace_id=public.current_workspace_id(auth.uid())
  ORDER BY e.revision DESC LIMIT p_limit) s;
 RETURN events;
END $tl_history$;
REVOKE ALL ON FUNCTION public.tl03_document_history(uuid,uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_history(uuid,uuid,integer)
 TO authenticated;

DO $tl_review_postflight$
DECLARE f pg_catalog.pg_proc%rowtype;
BEGIN
 SELECT * INTO f FROM pg_catalog.pg_proc
  WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure;
 IF f.oid IS NULL OR NOT f.prosecdef OR
   pg_catalog.pg_get_userbyid(f.proowner)<>'postgres' OR
   f.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}' OR
   f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] OR
   NOT has_function_privilege('authenticated',
    'public.tl03_document_review(uuid,uuid,bigint,text,text)','EXECUTE') OR
   has_function_privilege('anon',
    'public.tl03_document_review(uuid,uuid,bigint,text,text)','EXECUTE') OR
   has_function_privilege('anon',
    'private.tl03_review(uuid,uuid,bigint,text,text)','EXECUTE') OR
   has_function_privilege('anon',
    'public.tl03_document_history(uuid,uuid,integer)','EXECUTE') OR
   NOT has_function_privilege('authenticated',
    'public.tl03_document_history(uuid,uuid,integer)','EXECUTE') OR
   NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
    p.oid='public.tl03_document_review(uuid,uuid,bigint,text,text)'::regprocedure
    AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[]) OR
   NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
    p.oid='private.tl03_review(uuid,uuid,bigint,text,text)'::regprocedure
    AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
 THEN RAISE EXCEPTION 'TradeLink workflow review grant/owner/search-path drift'
  USING ERRCODE='42501'; END IF;
END $tl_review_postflight$;
COMMIT;
