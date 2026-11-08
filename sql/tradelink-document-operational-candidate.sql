-- Genuine signed TradeLink operational timestamps, completion and reopening.
-- SOURCE-ONLY candidate. Not for production execution without separate
-- exact-scope approval; all workflow feature switches remain OFF.
-- Depends on prior Submit, Review/Revision and Decision SQL candidates.
BEGIN;
DO $tl_operate_preflight$
DECLARE c text;
BEGIN
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO c FROM pg_catalog.pg_constraint
 WHERE conrelid='public.tradelink_document_events'::regclass
  AND conname='tradelink_document_events_operation_check';
 IF c IS DISTINCT FROM
  'CHECK ((operation = ANY (ARRAY[''created''::text, ''updated''::text, ''archived''::text, ''restored''::text, ''submitted''::text, ''completed''::text, ''reviewed''::text, ''revision-requested''::text, ''approved''::text, ''rejected''::text])))'
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('public.tl03_document_submit(uuid,uuid,bigint)') IS NULL
  OR to_regprocedure('public.tl03_document_review(uuid,uuid,bigint,text,text)') IS NULL
  OR to_regprocedure('public.tl03_document_decide(uuid,uuid,bigint,text,text)') IS NULL
  OR to_regprocedure('public.tl03_document_history(uuid,uuid,integer)') IS NULL
  OR to_regprocedure('private.tl03_operate(uuid,uuid,bigint,text,text)') IS NOT NULL
  OR to_regprocedure('public.tl03_document_operate(uuid,uuid,bigint,text,text)') IS NOT NULL
  OR NOT has_function_privilege('authenticated',
    'public.tl03_document_decide(uuid,uuid,bigint,text,text)','EXECUTE')
  OR has_function_privilege('anon',
    'public.tl03_document_decide(uuid,uuid,bigint,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink operational prerequisite or audit contract drift'
  USING ERRCODE='42501'; END IF;
END $tl_operate_preflight$;

ALTER TABLE public.tradelink_document_events
 DROP CONSTRAINT tradelink_document_events_operation_check;
ALTER TABLE public.tradelink_document_events
 ADD CONSTRAINT tradelink_document_events_operation_check
 CHECK(operation IN ('created','updated','archived','restored',
   'submitted','completed','reviewed','revision-requested','approved','rejected',
   'operational-record','reopened'));

CREATE FUNCTION private.tl03_operate(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,
 p_action text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $tl_operate$
DECLARE
 actor uuid:=auth.uid();d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;email text;assigned text;
 field_name text;target text;prior_state text;operation text;
 reason text:=pg_catalog.btrim(coalesce(p_reason,''));
 cycle_start bigint;rev bigint;modified_at timestamptz;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink manager scope required'
  USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
  OR p_action IS NULL OR p_action NOT IN
   ('record-checked','record-delivered','record-received','complete','reopen')
  OR (p_reason IS NOT NULL AND
   (pg_catalog.char_length(p_reason)>1500 OR p_reason~'[[:cntrl:]]'))
  OR (p_action='reopen' AND pg_catalog.char_length(reason) NOT BETWEEN 3 AND 1500)
 THEN RAISE EXCEPTION 'Invalid TradeLink operational action or reopening reason'
  USING ERRCODE='22023'; END IF;
 SELECT pg_catalog.lower(pg_catalog.btrim(u.email)) INTO email
 FROM auth.users u WHERE u.id=actor AND u.email_confirmed_at IS NOT NULL;
 IF email IS NULL OR email='' THEN
  RAISE EXCEPTION 'Confirmed signed operational actor required'
  USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.tradelink_documents
 WHERE id=p_document_id AND board_id=p_board_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
  OR d.revision IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'Stale or foreign TradeLink operational action'
  USING ERRCODE='PT409'; END IF;
 IF d.archived_at IS NOT NULL THEN
  RAISE EXCEPTION 'Archived TradeLink documents cannot transition'
  USING ERRCODE='PT409'; END IF;
 SELECT * INTO projection FROM public.work_board_items
 WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL
  OR projection.title IS DISTINCT FROM d.document_number
 THEN RAISE EXCEPTION 'TradeLink Board operational projection changed'
  USING ERRCODE='PT409'; END IF;
 prior_state:=d.workflow_state;
 SELECT coalesce(pg_catalog.max(e.revision),0) INTO cycle_start
 FROM public.tradelink_document_events e
 WHERE e.document_id=d.id AND e.board_id=p_board_id
  AND e.workspace_id=d.workspace_id
  AND e.operation IN ('submitted','reopened');
 IF p_action LIKE 'record-%' THEN
  IF d.workflow_state NOT IN ('submitted','under-review') OR
    (p_action IN ('record-checked','record-delivered') AND d.document_type<>'delivery') OR
    (p_action='record-received' AND d.document_type<>'payment')
  THEN RAISE EXCEPTION 'Operational timestamp invalid for document state/type'
   USING ERRCODE='PT409'; END IF;
  field_name:=CASE p_action WHEN 'record-checked' THEN 'checkedAt'
    WHEN 'record-delivered' THEN 'deliveredAt' ELSE 'receivedAt' END;
  assigned:=pg_catalog.lower(pg_catalog.btrim(
   CASE p_action WHEN 'record-checked' THEN coalesce(d.content->>'checkedBy','')
    WHEN 'record-delivered' THEN coalesce(d.content->>'deliveredBy','')
    ELSE coalesce(d.content->>'receivedBy','') END));
  -- Assignment must be an exact confirmed signed account email. A typed
  -- person name, manager status or arbitrary client timestamp never proves
  -- the responsible QC/logistics/payment actor.
  IF assigned='' OR assigned !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR email IS DISTINCT FROM assigned
  THEN RAISE EXCEPTION 'Signed operational assignee email mismatch'
   USING ERRCODE='42501'; END IF;
  IF cycle_start=0 OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
      WHERE e.document_id=d.id AND e.board_id=p_board_id AND e.workspace_id=d.workspace_id
       AND e.operation='submitted' AND e.revision=cycle_start)
    OR EXISTS(SELECT 1 FROM public.tradelink_document_events e
      WHERE e.document_id=d.id AND e.board_id=p_board_id AND e.workspace_id=d.workspace_id
       AND e.revision>cycle_start AND e.operation='operational-record'
       AND e.metadata->>'field'=field_name)
  THEN RAISE EXCEPTION 'Missing submission or duplicate operational evidence'
   USING ERRCODE='PT409'; END IF;
  target:=prior_state;operation:='operational-record';
 ELSIF p_action='complete' THEN
  IF d.document_type IN ('esi','quotation','po') THEN
   IF d.workflow_state<>'approved' OR NOT EXISTS(
    SELECT 1 FROM public.tradelink_document_events e
    WHERE e.document_id=d.id AND e.board_id=p_board_id
      AND e.workspace_id=d.workspace_id AND e.operation='approved'
      AND e.revision=d.revision)
   THEN RAISE EXCEPTION 'Signed commercial approval required before completion'
    USING ERRCODE='42501'; END IF;
  ELSIF d.document_type IN ('delivery','payment') THEN
   IF d.workflow_state NOT IN ('submitted','under-review')
   THEN RAISE EXCEPTION 'Operational completion requires submitted document'
    USING ERRCODE='PT409'; END IF;
   IF cycle_start=0 OR NOT EXISTS(
    SELECT 1 FROM public.tradelink_document_events e
    WHERE e.document_id=d.id AND e.board_id=p_board_id
     AND e.workspace_id=d.workspace_id AND e.operation='submitted'
     AND e.revision=cycle_start)
   THEN RAISE EXCEPTION 'Current signed submission evidence required'
    USING ERRCODE='42501'; END IF;
   IF d.document_type='delivery' AND (
     NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
       WHERE e.document_id=d.id AND e.board_id=p_board_id
        AND e.workspace_id=d.workspace_id AND e.revision>cycle_start
        AND e.operation='operational-record' AND e.metadata->>'field'='checkedAt')
     OR NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
       WHERE e.document_id=d.id AND e.board_id=p_board_id
        AND e.workspace_id=d.workspace_id AND e.revision>cycle_start
        AND e.operation='operational-record' AND e.metadata->>'field'='deliveredAt'))
   THEN RAISE EXCEPTION 'Current signed QC and delivery timestamps required'
    USING ERRCODE='42501'; END IF;
   IF d.document_type='payment' AND (
     NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
       WHERE e.document_id=d.id AND e.board_id=p_board_id
        AND e.workspace_id=d.workspace_id AND e.revision>cycle_start
        AND e.operation='operational-record' AND e.metadata->>'field'='receivedAt')
     OR pg_catalog.btrim(coalesce(d.content->>'verifiedBy',''))<>'' AND
      NOT EXISTS(SELECT 1 FROM public.tradelink_document_events e
       JOIN auth.users reviewer ON reviewer.id=e.actor_id
       WHERE e.document_id=d.id AND e.board_id=p_board_id
        AND e.workspace_id=d.workspace_id AND e.revision>cycle_start
        AND e.operation='reviewed' AND reviewer.email_confirmed_at IS NOT NULL
        AND pg_catalog.lower(pg_catalog.btrim(reviewer.email))=
          pg_catalog.lower(pg_catalog.btrim(coalesce(d.content->>'verifiedByEmail','')))))
   THEN RAISE EXCEPTION 'Signed receipt and assigned payment verification required'
    USING ERRCODE='42501'; END IF;
  ELSE
   RAISE EXCEPTION 'Packing List completion only occurs on signed submit'
    USING ERRCODE='PT409'; END IF;
  target:='completed';operation:='completed';
 ELSE
  IF d.workflow_state NOT IN ('approved','rejected','completed','cancelled')
  THEN RAISE EXCEPTION 'Only a terminal or approved document may be reopened'
   USING ERRCODE='PT409'; END IF;
  target:='draft';operation:='reopened';
 END IF;
 UPDATE public.tradelink_documents
 SET workflow_state=target,revision=revision+1,updated_by=actor,
     updated_at=pg_catalog.clock_timestamp()
 WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
 UPDATE public.work_board_items
 SET updated_by=actor,updated_at=modified_at
 WHERE id=d.board_item_id AND board_id=p_board_id
  AND title=d.document_number AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'TradeLink Board operational projection changed'
  USING ERRCODE='PT409'; END IF;
 INSERT INTO public.tradelink_document_events
  (document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES(d.id,p_board_id,d.workspace_id,rev,operation,actor,
  pg_catalog.jsonb_build_object('action',p_action,'from',prior_state,
   'to',target,'field',field_name,'at',modified_at,'reason',reason,
   'documentType',d.document_type));
 PERFORM public.work_board_log(p_board_id,'tradelink.workflow.'||p_action,
  'TradeLink signed operational event','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',rev,'from',prior_state,
   'to',target,'field',field_name));
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,
  'boardItemId',d.board_item_id,'revision',rev,'state',target,
  'operation',p_action,'from',prior_state,'field',field_name,
  'recordedAt',modified_at);
END $tl_operate$;
REVOKE ALL ON FUNCTION private.tl03_operate(uuid,uuid,bigint,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_operate(uuid,uuid,bigint,text,text)
 TO authenticated;
CREATE FUNCTION public.tl03_document_operate(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,
 p_action text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $tl_rpc$
 SELECT private.tl03_operate(p_board_id,p_document_id,p_expected_revision,p_action,p_reason);
$tl_rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_operate(uuid,uuid,bigint,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_operate(uuid,uuid,bigint,text,text)
 TO authenticated;
DO $tl_operate_postflight$
DECLARE f pg_catalog.pg_proc%rowtype;
BEGIN
 SELECT * INTO f FROM pg_catalog.pg_proc
 WHERE oid='private.tl03_operate(uuid,uuid,bigint,text,text)'::regprocedure;
 IF f.oid IS NULL OR NOT f.prosecdef
  OR pg_catalog.pg_get_userbyid(f.proowner)<>'postgres'
  OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR f.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  OR has_function_privilege('anon',f.oid,'EXECUTE')
  OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'public.tl03_document_operate(uuid,uuid,bigint,text,text)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_document_operate(uuid,uuid,bigint,text,text)','EXECUTE')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid='public.tl03_document_operate(uuid,uuid,bigint,text,text)'::regprocedure
     AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
 THEN RAISE EXCEPTION 'TradeLink operational RPC grant/security posture drift'
  USING ERRCODE='42501'; END IF;
END $tl_operate_postflight$;
COMMIT;
