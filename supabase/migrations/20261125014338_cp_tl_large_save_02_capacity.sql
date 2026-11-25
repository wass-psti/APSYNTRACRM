-- CP-TL-LARGE-SAVE-02
-- Align draft creation, revision snapshots and submission at 250 items / 2 MiB.
-- The save/commit functions, signed RPC wrappers, ownership, grants and RLS are preserved.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

DO $preflight$
DECLARE
 v_validator text;
 v_submit text;
 v_save text;
 v_public_submit text;
 v_document_check text;
 v_snapshot_check text;
BEGIN
 SELECT md5(pg_catalog.pg_get_functiondef('private.tl03_validate_draft(jsonb)'::regprocedure)) INTO v_validator;
 SELECT md5(pg_catalog.pg_get_functiondef('private.tl03_submit(uuid,uuid,bigint)'::regprocedure)) INTO v_submit;
 SELECT md5(pg_catalog.pg_get_functiondef('private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure)) INTO v_save;
 SELECT md5(pg_catalog.pg_get_functiondef('public.tl03_document_submit(uuid,uuid,bigint)'::regprocedure)) INTO v_public_submit;
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO v_document_check
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.tradelink_documents'::regclass
    AND conname='tradelink_documents_content_check' AND convalidated;
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO v_snapshot_check
  FROM pg_catalog.pg_constraint
  WHERE conrelid='private.tradelink_document_revision_snapshots'::regclass
    AND conname='tradelink_document_revision_snapshots_content_check' AND convalidated;
 IF v_validator IS DISTINCT FROM '7ba1b798747d1f02fd36c52b3d5f6399'
  OR v_submit IS DISTINCT FROM 'f4ddf1da3d689cd14f9fcc877529de20'
  OR v_save IS DISTINCT FROM '9b767cf0213922bca7d0c84a38d75606'
  OR v_public_submit IS DISTINCT FROM '0b06106b0c21b351eab3e9cf827cdb11' THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 preflight failed: TradeLink RPC definitions changed.' USING ERRCODE='55000';
 END IF;
 IF v_document_check IS DISTINCT FROM
   'CHECK (((jsonb_typeof(content) = ''object''::text) AND (octet_length((content)::text) <= 131072)))'
  OR v_snapshot_check IS DISTINCT FROM
   'CHECK (((jsonb_typeof(content) = ''object''::text) AND (octet_length((content)::text) <= 131072)))' THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 preflight failed: expected 128 KiB document and revision constraints.' USING ERRCODE='55000';
 END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)<>'postgres'
  OR (SELECT provolatile FROM pg_catalog.pg_proc WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)<>'i'
  OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)
  OR (SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres}'
  OR (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure) IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 preflight failed: draft validator ownership, volatility, ACL or search_path changed.' USING ERRCODE='55000';
 END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='private.tl03_submit(uuid,uuid,bigint)'::regprocedure)<>'postgres'
  OR NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='private.tl03_submit(uuid,uuid,bigint)'::regprocedure)
  OR (SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='private.tl03_submit(uuid,uuid,bigint)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  OR (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid='private.tl03_submit(uuid,uuid,bigint)'::regprocedure) IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 preflight failed: submit function ownership, ACL or search_path changed.' USING ERRCODE='55000';
 END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure)<>'postgres'
  OR NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure)
  OR (SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  OR (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure) IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 preflight failed: commit execution context changed.' USING ERRCODE='55000';
 END IF;
 IF pg_catalog.strpos(pg_catalog.pg_get_functiondef('private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure),'private.tl03_validate_draft')=0
  OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure),'private.tl03_validate_draft')=0
  OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('private.tl03_submit(uuid,uuid,bigint)'::regprocedure),'private.tl03_validate_draft')=0 THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 preflight failed: a signed write path no longer calls the shared validator.' USING ERRCODE='55000';
 END IF;
 IF EXISTS (SELECT 1 FROM public.tradelink_documents WHERE pg_catalog.octet_length(content::text)>2097152)
  OR EXISTS (SELECT 1 FROM private.tradelink_document_revision_snapshots WHERE pg_catalog.octet_length(content::text)>2097152) THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 preflight failed: existing content exceeds the approved capacity.' USING ERRCODE='55000';
 END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION private.tl03_validate_draft(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $validate$
DECLARE it jsonb; field text;
BEGIN
 IF p_data IS NULL OR pg_catalog.jsonb_typeof(p_data)<>'object'
  OR pg_catalog.octet_length(p_data::text)>2097152 THEN
  RAISE EXCEPTION 'Invalid TradeLink draft envelope' USING ERRCODE='22023'; END IF;
 IF (p_data - ARRAY[
  'documentType','documentNumber','date','vendorId','templateId',
  'customerName','customerAddress','customerTin','customerContact','customerEmail','customerPhone',
  'dueDate','referenceNumber','poNumber','paymentTerms','paymentTermsCustom',
  'validity','validityCustom','deliveryCommitment','deliveryCommitmentCustom',
  'targetDeliveryDate','remarks','terms','currency','exchangeRate',
  'vatType','discountType','discountValue','discountReason','items','quoteStatus',
  'verifiedBy','verifiedByEmail','approvedBy','approvedByEmail',
  'paymentForm','cashAmount','bankName','chequeAmount','chequeNumber',
  'paymentParticulars','receivedBy','drIncludePricing','checkedBy','deliveredBy'
 ])<>'{}'::jsonb THEN
  RAISE EXCEPTION 'Unknown or server-owned document property' USING ERRCODE='22023'; END IF;
 IF pg_catalog.jsonb_typeof(p_data->'documentType') IS DISTINCT FROM 'string'
  OR pg_catalog.jsonb_typeof(p_data->'documentNumber') IS DISTINCT FROM 'string'
  OR pg_catalog.jsonb_typeof(p_data->'documentType') IS DISTINCT FROM 'string'
  OR p_data->>'documentType' NOT IN ('esi','packing','delivery','payment','quotation','po')
  OR p_data->>'documentNumber' IS NULL
  OR pg_catalog.char_length(p_data->>'documentNumber') NOT BETWEEN 1 AND 120
  OR p_data->>'documentNumber' !~ '^[A-Za-z0-9][A-Za-z0-9._ /-]*$'
  OR p_data->>'documentNumber' IS DISTINCT FROM pg_catalog.btrim(p_data->>'documentNumber') THEN
  RAISE EXCEPTION 'Invalid document type or number' USING ERRCODE='22023'; END IF;
 IF p_data ? 'quoteStatus' AND
  (p_data->>'documentType' IS DISTINCT FROM 'quotation'
   OR p_data->>'quoteStatus' IS NULL OR p_data->>'quoteStatus' NOT IN
   ('Working on it','Sent','Client Review','Accepted','Declined','On Hold','Closed')) THEN
  RAISE EXCEPTION 'Invalid source quote status' USING ERRCODE='22023'; END IF;
 IF p_data ? 'currency' AND (p_data->>'currency' IS NULL OR p_data->>'currency' NOT IN
  ('PHP','USD','EUR','GBP','JPY','CNY','SGD','AUD','SAR')) THEN
  RAISE EXCEPTION 'Invalid currency' USING ERRCODE='22023'; END IF;
 IF p_data ? 'vatType' AND (p_data->>'vatType' IS NULL
  OR p_data->>'vatType' NOT IN ('15_tkm','15_ksa','12','exempt','zero')) THEN
  RAISE EXCEPTION 'Invalid VAT code' USING ERRCODE='22023'; END IF;
 IF p_data ? 'discountType' AND (p_data->>'discountType' IS NULL
  OR p_data->>'discountType' NOT IN ('percentage','fixed')) THEN
  RAISE EXCEPTION 'Invalid discount type' USING ERRCODE='22023'; END IF;
 IF p_data ? 'paymentForm' AND (p_data->>'paymentForm' IS NULL
  OR p_data->>'paymentForm' NOT IN ('cash','cheque')) THEN
  RAISE EXCEPTION 'Invalid payment form' USING ERRCODE='22023'; END IF;
 FOR field IN SELECT pg_catalog.unnest(ARRAY[
  'exchangeRate','discountValue','cashAmount','chequeAmount']) LOOP
  IF p_data ? field AND (pg_catalog.jsonb_typeof(p_data->field)<>'number'
   OR (p_data->>field)::numeric<0 OR (p_data->>field)::numeric>1000000000000) THEN
   RAISE EXCEPTION 'Invalid numeric TradeLink field %',field USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR field IN SELECT pg_catalog.unnest(ARRAY[
  'date','vendorId','templateId','customerName','customerAddress','customerTin',
  'customerContact','customerEmail','customerPhone','dueDate','referenceNumber',
  'poNumber','paymentTerms','paymentTermsCustom','validity','validityCustom',
  'deliveryCommitment','deliveryCommitmentCustom','targetDeliveryDate',
  'remarks','terms','discountReason','verifiedBy','verifiedByEmail',
  'approvedBy','approvedByEmail','bankName','chequeNumber','paymentParticulars',
  'receivedBy','checkedBy','deliveredBy']) LOOP
  IF p_data ? field AND (pg_catalog.jsonb_typeof(p_data->field)<>'string'
   OR pg_catalog.char_length(p_data->>field)>5000) THEN
   RAISE EXCEPTION 'Invalid text TradeLink field %',field USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH field IN ARRAY ARRAY['date','dueDate'] LOOP
  IF p_data ? field THEN
   IF p_data->>field !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Invalid TradeLink calendar date %',field USING ERRCODE='22023'; END IF;
   BEGIN
    PERFORM (p_data->>field)::date;
   EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid TradeLink calendar date %',field USING ERRCODE='22023';
   END;
  END IF;
 END LOOP;
 IF p_data ? 'drIncludePricing'
   AND pg_catalog.jsonb_typeof(p_data->'drIncludePricing')<>'boolean' THEN
  RAISE EXCEPTION 'Invalid delivery pricing flag' USING ERRCODE='22023'; END IF;
 IF p_data ? 'items' THEN
  IF pg_catalog.jsonb_typeof(p_data->'items')<>'array'
   OR pg_catalog.jsonb_array_length(p_data->'items')>250 THEN
   RAISE EXCEPTION 'Invalid bounded line items' USING ERRCODE='22023'; END IF;
  FOR it IN SELECT value FROM pg_catalog.jsonb_array_elements(p_data->'items') LOOP
   IF pg_catalog.jsonb_typeof(it)<>'object' OR it->>'kind' IS NULL
    OR it->>'kind' NOT IN ('item','note')
    OR pg_catalog.char_length(coalesce(it->>'id','')) NOT BETWEEN 1 AND 120
    OR pg_catalog.char_length(coalesce(it->>'description',''))>2000
    OR pg_catalog.jsonb_typeof(it->'id') IS DISTINCT FROM 'string'
    OR (it ? 'description' AND pg_catalog.jsonb_typeof(it->'description')<>'string')
    OR (it ? 'unit' AND pg_catalog.jsonb_typeof(it->'unit')<>'string')
    OR (it ? 'serialNumber' AND pg_catalog.jsonb_typeof(it->'serialNumber')<>'string')
    OR (it - ARRAY['id','kind','description','quantity','unit','unitPrice','serialNumber'])<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid source line item' USING ERRCODE='22023'; END IF;
   IF it->>'kind'='item' AND
    (pg_catalog.jsonb_typeof(it->'quantity') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(it->'unitPrice') IS DISTINCT FROM 'number'
     OR (it->>'quantity')::numeric<0 OR (it->>'quantity')::numeric>1000000000
     OR (it->>'unitPrice')::numeric<0 OR (it->>'unitPrice')::numeric>1000000000) THEN
    RAISE EXCEPTION 'Invalid quantity or unit price' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF EXISTS (
   SELECT 1 FROM pg_catalog.jsonb_array_elements(p_data->'items') AS line(value)
   GROUP BY line.value->>'id' HAVING pg_catalog.count(*)>1
  ) THEN
   RAISE EXCEPTION 'Duplicate TradeLink line item identifier' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN p_data;
END $validate$;

CREATE OR REPLACE FUNCTION private.tl03_submit(
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
 IF d.workflow_state NOT IN ('draft','revision-required') OR d.archived_at IS NOT NULL THEN
  RAISE EXCEPTION 'Only active Drafts or revision-requested documents may be submitted'
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
    OR pg_catalog.jsonb_array_length(items) NOT BETWEEN 1 AND 250
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
  actor,pg_catalog.jsonb_build_object('action','submit','from',d.workflow_state,
    'to',target,'documentType',d.document_type));
 PERFORM public.work_board_log(p_board_id,'tradelink.workflow.submit',
  'TradeLink workflow submission committed','tradelink-document',d.id::text,
  pg_catalog.jsonb_build_object('revision',rev,'from',d.workflow_state,'to',target));
 RETURN pg_catalog.jsonb_build_object(
  'documentId',d.id,'boardItemId',d.board_item_id,
  'revision',rev,'state',target,'operation','submit','from',d.workflow_state);
END $tl_submit$;

ALTER TABLE public.tradelink_documents
 DROP CONSTRAINT tradelink_documents_content_check;
ALTER TABLE public.tradelink_documents
 ADD CONSTRAINT tradelink_documents_content_check
 CHECK (jsonb_typeof(content)='object' AND octet_length(content::text)<=2097152) NOT VALID;
ALTER TABLE public.tradelink_documents
 VALIDATE CONSTRAINT tradelink_documents_content_check;

ALTER TABLE private.tradelink_document_revision_snapshots
 DROP CONSTRAINT tradelink_document_revision_snapshots_content_check;
ALTER TABLE private.tradelink_document_revision_snapshots
 ADD CONSTRAINT tradelink_document_revision_snapshots_content_check
 CHECK (jsonb_typeof(content)='object' AND octet_length(content::text)<=2097152) NOT VALID;
ALTER TABLE private.tradelink_document_revision_snapshots
 VALIDATE CONSTRAINT tradelink_document_revision_snapshots_content_check;

DO $postflight$
DECLARE
 v_validator text;
 v_submit text;
 v_document_check text;
 v_snapshot_check text;
BEGIN
 v_validator:=pg_catalog.pg_get_functiondef('private.tl03_validate_draft(jsonb)'::regprocedure);
 v_submit:=pg_catalog.pg_get_functiondef('private.tl03_submit(uuid,uuid,bigint)'::regprocedure);
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO v_document_check
  FROM pg_catalog.pg_constraint WHERE conrelid='public.tradelink_documents'::regclass
   AND conname='tradelink_documents_content_check' AND convalidated;
 SELECT pg_catalog.pg_get_constraintdef(oid) INTO v_snapshot_check
  FROM pg_catalog.pg_constraint WHERE conrelid='private.tradelink_document_revision_snapshots'::regclass
   AND conname='tradelink_document_revision_snapshots_content_check' AND convalidated;
 IF pg_catalog.strpos(v_validator,'octet_length(p_data::text)>2097152')=0
  OR pg_catalog.strpos(v_validator,'jsonb_array_length(p_data->''items'')>250')=0
  OR pg_catalog.strpos(v_validator,'Duplicate TradeLink line item identifier')=0
  OR pg_catalog.strpos(v_submit,'NOT BETWEEN 1 AND 250')=0 THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 postflight failed: updated validator or submit limit is missing.' USING ERRCODE='55000';
 END IF;
 IF v_document_check IS NULL OR pg_catalog.strpos(v_document_check,'2097152')=0
  OR v_snapshot_check IS NULL OR pg_catalog.strpos(v_snapshot_check,'2097152')=0 THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 postflight failed: 2 MiB document and revision constraints are not validated.' USING ERRCODE='55000';
 END IF;
 IF md5(pg_catalog.pg_get_functiondef('private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure))<>'9b767cf0213922bca7d0c84a38d75606'
  OR md5(pg_catalog.pg_get_functiondef('public.tl03_document_submit(uuid,uuid,bigint)'::regprocedure))<>'0b06106b0c21b351eab3e9cf827cdb11' THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 postflight failed: an unchanged save/commit/wrapper function was modified.' USING ERRCODE='55000';
 END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure)<>'postgres'
  OR NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure)
  OR (SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  OR (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid='private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure) IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR pg_catalog.strpos(pg_catalog.pg_get_functiondef('private.tl03_commit(uuid,uuid,bigint,text,jsonb)'::regprocedure),'private.tl03_validate_draft')=0 THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 postflight failed: commit path no longer uses the shared validator or its execution context changed.' USING ERRCODE='55000';
 END IF;
 IF (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)<>'postgres'
  OR (SELECT provolatile FROM pg_catalog.pg_proc WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)<>'i'
  OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure)
  OR (SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres}'
  OR (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid='private.tl03_validate_draft(jsonb)'::regprocedure) IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR (SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc WHERE oid='private.tl03_submit(uuid,uuid,bigint)'::regprocedure)<>'postgres'
  OR (SELECT provolatile FROM pg_catalog.pg_proc WHERE oid='private.tl03_submit(uuid,uuid,bigint)'::regprocedure)<>'v'
  OR NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='private.tl03_submit(uuid,uuid,bigint)'::regprocedure)
  OR (SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='private.tl03_submit(uuid,uuid,bigint)'::regprocedure) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
  OR (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid='private.tl03_submit(uuid,uuid,bigint)'::regprocedure) IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
  RAISE EXCEPTION 'CP-TL-LARGE-SAVE-02 postflight failed: existing function ACL or execution context changed.' USING ERRCODE='55000';
 END IF;
END
$postflight$;

COMMIT;
