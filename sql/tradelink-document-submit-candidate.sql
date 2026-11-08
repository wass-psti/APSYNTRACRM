-- TradeLink document workflow: genuine signed DRAFT submission only.
-- SOURCE-ONLY CANDIDATE. DO NOT execute against production without separate
-- exact-scope authorization: alters one existing audit CHECK and creates
-- one new private guarded function + one authenticated-executable public RPC.
-- Review/revision/approval/rejection/operational completion/reopen remain
-- separately protected and are NOT activated by this candidate.
BEGIN;
DO $tl_submit_preflight$
DECLARE expected text;
BEGIN
 SELECT pg_catalog.pg_get_constraintdef(c.oid) INTO expected
 FROM pg_catalog.pg_constraint c
 WHERE c.conrelid='public.tradelink_document_events'::regclass
  AND c.conname='tradelink_document_events_operation_check';
 IF expected IS DISTINCT FROM
  'CHECK ((operation = ANY (ARRAY[''created''::text, ''updated''::text, ''archived''::text, ''restored''::text])))'
 OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
 OR to_regprocedure('private.tl03_validate_draft(jsonb)') IS NULL
 OR to_regprocedure('public.tl03_document_read(uuid,uuid)') IS NULL
 OR to_regprocedure('public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)') IS NULL
 OR to_regprocedure('private.tl03_submit(uuid,uuid,bigint)') IS NOT NULL
 OR to_regprocedure('public.tl03_document_submit(uuid,uuid,bigint)') IS NOT NULL
 OR NOT has_function_privilege('authenticated',
  'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
 OR has_function_privilege('anon',
  'public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink submit candidate: unexpected source or grants'
  USING ERRCODE='42501'; END IF;
END $tl_submit_preflight$;

-- Append-only event table already contains a source-enforced action CHECK.
-- Extend only to the two genuine states produced by this RPC.
ALTER TABLE public.tradelink_document_events
 DROP CONSTRAINT tradelink_document_events_operation_check;
ALTER TABLE public.tradelink_document_events
 ADD CONSTRAINT tradelink_document_events_operation_check
 CHECK(operation IN ('created','updated','archived','restored','submitted','completed'));

CREATE FUNCTION private.tl03_submit(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $tl_submit$
DECLARE
 actor uuid:=auth.uid();
 d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype;
 target text; rev bigint; modified_at timestamptz;
 c jsonb; items jsonb; total numeric;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Signed TradeLink General Manager required'
  USING ERRCODE='42501'; END IF;
 IF p_document_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
 THEN RAISE EXCEPTION 'Invalid TradeLink submission revision'
  USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM public.tradelink_documents
  WHERE id=p_document_id AND board_id=p_board_id FOR UPDATE;
 IF d.id IS NULL OR d.workspace_id IS DISTINCT FROM public.current_workspace_id(actor)
  OR d.revision IS DISTINCT FROM p_expected_revision
 THEN RAISE EXCEPTION 'Stale or inaccessible TradeLink submission'
  USING ERRCODE='PT409'; END IF;
 IF d.workflow_state<>'draft' OR d.archived_at IS NOT NULL THEN
  RAISE EXCEPTION 'Only an active Draft may be submitted'
  USING ERRCODE='PT409'; END IF;
 SELECT * INTO projection FROM public.work_board_items
  WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
 IF projection.id IS NULL OR projection.archived_at IS NOT NULL
   OR projection.title IS DISTINCT FROM d.document_number THEN
  RAISE EXCEPTION 'TradeLink Board projection changed'
  USING ERRCODE='PT409'; END IF;
 c:=private.tl03_validate_draft(d.content);
 IF c->>'documentType' IS DISTINCT FROM d.document_type
  OR c->>'documentNumber' IS DISTINCT FROM d.document_number
  OR pg_catalog.btrim(coalesce(c->>'customerName',''))='' THEN
  RAISE EXCEPTION 'TradeLink submitted document identity or party incomplete'
  USING ERRCODE='22023'; END IF;
 items:=c->'items';
 IF d.document_type IN ('esi','quotation','po','packing','delivery') AND
  (pg_catalog.jsonb_typeof(items) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(items) NOT BETWEEN 1 AND 100
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(items) AS l(value)
      WHERE pg_catalog.btrim(coalesce(l.value->>'description',''))=''
      OR (l.value->>'quantity')::numeric<=0
      OR (d.document_type IN ('esi','quotation','po')
         AND (l.value->>'unitPrice')::numeric<=0))) THEN
  RAISE EXCEPTION 'TradeLink items incomplete for submission'
   USING ERRCODE='22023'; END IF;
 IF d.document_type IN ('packing','delivery') AND
    pg_catalog.btrim(coalesce(c->>'referenceNumber',''))='' THEN
  RAISE EXCEPTION 'Shipment source reference required'
   USING ERRCODE='22023'; END IF;
 IF d.document_type='delivery' AND
    (pg_catalog.btrim(coalesce(c->>'checkedBy',''))='' OR
     pg_catalog.btrim(coalesce(c->>'deliveredBy',''))='') THEN
  RAISE EXCEPTION 'Delivery QC and logistics responsibilities required'
   USING ERRCODE='22023'; END IF;
 IF d.document_type='esi' AND
    (pg_catalog.btrim(coalesce(c->>'customerTin',''))='' OR
     pg_catalog.btrim(coalesce(c->>'verifiedBy',''))='' OR
     pg_catalog.btrim(coalesce(c->>'approvedBy',''))='') THEN
  RAISE EXCEPTION 'ESI source readiness incomplete'
   USING ERRCODE='22023'; END IF;
 IF d.document_type='quotation' AND
    (pg_catalog.btrim(coalesce(c->>'customerEmail',''))='' AND
     pg_catalog.btrim(coalesce(c->>'customerPhone',''))='' OR
     pg_catalog.btrim(coalesce(c->>'validity',''))='' OR
     pg_catalog.btrim(coalesce(c->>'deliveryCommitment',''))='' OR
     pg_catalog.btrim(coalesce(c->>'paymentTerms',''))='' OR
     pg_catalog.btrim(coalesce(c->>'approvedBy',''))='') THEN
  RAISE EXCEPTION 'Quotation source readiness incomplete'
   USING ERRCODE='22023'; END IF;
 IF d.document_type='po' AND
    (pg_catalog.btrim(coalesce(c->>'targetDeliveryDate',''))='' OR
     pg_catalog.btrim(coalesce(c->>'paymentTerms',''))='' OR
     pg_catalog.btrim(coalesce(c->>'verifiedBy',''))='' OR
     pg_catalog.btrim(coalesce(c->>'approvedBy',''))='') THEN
  RAISE EXCEPTION 'Supplier PO readiness incomplete'
   USING ERRCODE='22023'; END IF;
 IF d.document_type='payment' THEN
  total:=coalesce((c->>'cashAmount')::numeric,0)+
    coalesce((c->>'chequeAmount')::numeric,0);
  IF pg_catalog.btrim(coalesce(c->>'paymentParticulars',''))='' OR
     pg_catalog.btrim(coalesce(c->>'receivedBy',''))='' OR
     pg_catalog.btrim(coalesce(c->>'verifiedBy',''))='' OR total<=0 OR
     (coalesce((c->>'chequeAmount')::numeric,0)>0 AND
      (pg_catalog.btrim(coalesce(c->>'bankName',''))='' OR
       pg_catalog.btrim(coalesce(c->>'chequeNumber',''))='')) THEN
   RAISE EXCEPTION 'Payment Draft readiness incomplete'
    USING ERRCODE='22023'; END IF;
 END IF;
 -- Source packing workflow completes on submit. This does not validate a
 -- delivery receipt, receive funds, issue approval or generate a PDF.
 target:=CASE WHEN d.document_type='packing' THEN 'completed' ELSE 'submitted' END;
 UPDATE public.tradelink_documents
  SET workflow_state=target,revision=revision+1,updated_by=actor,
      updated_at=pg_catalog.clock_timestamp()
  WHERE id=d.id RETURNING revision,updated_at INTO rev,modified_at;
 UPDATE public.work_board_items
  SET updated_at=modified_at,updated_by=actor
  WHERE id=d.board_item_id AND board_id=p_board_id
   AND title=d.document_number AND archived_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'TradeLink Board submit projection changed'
   USING ERRCODE='PT409'; END IF;
 INSERT INTO public.tradelink_document_events
 (document_id,board_id,workspace_id,revision,operation,actor_id,metadata)
 VALUES(d.id,p_board_id,d.workspace_id,rev,
  CASE WHEN target='completed' THEN 'completed' ELSE 'submitted' END,
  actor,pg_catalog.jsonb_build_object('action','submit','from','draft',
    'to',target,'documentType',d.document_type));
 PERFORM public.work_board_log(p_board_id,'tradelink.workflow.submit',
  'TradeLink workflow submission committed','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',rev,'from','draft','to',target));
 RETURN pg_catalog.jsonb_build_object(
  'documentId',d.id,'boardItemId',d.board_item_id,
  'revision',rev,'state',target,'operation','submit','from','draft');
END $tl_submit$;
REVOKE ALL ON FUNCTION private.tl03_submit(uuid,uuid,bigint)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_submit(uuid,uuid,bigint) TO authenticated;

CREATE FUNCTION public.tl03_document_submit(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $tl_rpc$
 SELECT private.tl03_submit(p_board_id,p_document_id,p_expected_revision);
$tl_rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_submit(uuid,uuid,bigint)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_submit(uuid,uuid,bigint) TO authenticated;

DO $tl_submit_postflight$
BEGIN
 IF has_function_privilege('anon',
  'public.tl03_document_submit(uuid,uuid,bigint)','EXECUTE') OR
  has_function_privilege('anon',
  'private.tl03_submit(uuid,uuid,bigint)','EXECUTE') OR
  NOT has_function_privilege('authenticated',
   'public.tl03_document_submit(uuid,uuid,bigint)','EXECUTE') OR
  NOT EXISTS(SELECT 1 FROM pg_proc WHERE
   oid='private.tl03_submit(uuid,uuid,bigint)'::regprocedure
   AND prosecdef AND proconfig=ARRAY['search_path=""']::text[]) OR
  NOT EXISTS(SELECT 1 FROM pg_proc WHERE
   oid='public.tl03_document_submit(uuid,uuid,bigint)'::regprocedure
   AND NOT prosecdef AND proconfig=ARRAY['search_path=""']::text[]) THEN
  RAISE EXCEPTION 'TradeLink signed submit RPC grants or function posture drift'
   USING ERRCODE='42501'; END IF;
END $tl_submit_postflight$;
COMMIT;
