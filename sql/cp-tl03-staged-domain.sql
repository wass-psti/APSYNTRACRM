-- CP-TL-03A STAGED. NOT APPROVED OR EXECUTED IN PRODUCTION.
-- Additive source-aligned draft persistence, central signed RBAC/RLS, atomic board item, CAS + audit.
-- No standalone TradeLink membership, login, Service Role, or Storage bucket.
BEGIN;
DO $preflight$
BEGIN
 IF to_regnamespace('private') IS NULL
 OR NOT has_schema_privilege('authenticated','private','USAGE')
 OR to_regprocedure('private.wm_board_config_session_active()') IS NULL
 OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
 OR to_regprocedure('public.module_role_for(text,uuid)') IS NULL
 OR to_regprocedure('public.wm_add_board_item(uuid,uuid,text)') IS NULL
 OR to_regprocedure('public.wm_set_board_cell_if_current(uuid,uuid,jsonb,jsonb)') IS NULL
 OR to_regprocedure('public.wm_set_board_item_archived(uuid,boolean)') IS NULL
 OR to_regclass('public.tradelink_documents') IS NOT NULL
 OR to_regclass('public.tradelink_document_events') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM public.work_boards b
   WHERE b.id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
    AND b.workspace_id='00000000-0000-4000-8000-000000000001'::uuid
    AND b.name='TradeLink' AND b.status='active'
    AND b.archived_at IS NULL AND b.trashed_at IS NULL
    AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%')
 THEN RAISE EXCEPTION 'CP-TL-03A board/function/schema drift' USING ERRCODE='42501'; END IF;
END $preflight$;

CREATE TABLE public.tradelink_documents(
 id uuid PRIMARY KEY,
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL,
 board_item_id uuid NOT NULL UNIQUE REFERENCES public.work_board_items(id) ON DELETE RESTRICT,
 document_type text NOT NULL CHECK(document_type IN ('esi','packing','delivery','payment','quotation','po')),
 document_number text NOT NULL CHECK(char_length(document_number) BETWEEN 1 AND 120),
 workflow_state text NOT NULL DEFAULT 'draft' CHECK(workflow_state IN
  ('draft','submitted','under-review','revision-required','approved','rejected','completed','cancelled')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>=1),
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=131072),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 archived_at timestamptz,
 CONSTRAINT tl03_board_scope CHECK(
  board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND workspace_id='00000000-0000-4000-8000-000000000001'::uuid)
);
CREATE UNIQUE INDEX tl03_unique_active_number ON public.tradelink_documents
 (board_id,document_type,lower(document_number)) WHERE archived_at IS NULL;
CREATE INDEX tl03_document_updated ON public.tradelink_documents(board_id,updated_at DESC,id DESC);

CREATE TABLE public.tradelink_document_events(
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 document_id uuid NOT NULL REFERENCES public.tradelink_documents(id) ON DELETE RESTRICT,
 board_id uuid NOT NULL REFERENCES public.work_boards(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>=1),
 operation text NOT NULL CHECK(operation IN ('created','updated','archived','restored')),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
 UNIQUE(document_id,revision),
 CONSTRAINT tl03_event_scope CHECK(
  board_id='264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  AND workspace_id='00000000-0000-4000-8000-000000000001'::uuid)
);
CREATE INDEX tl03_event_revision ON public.tradelink_document_events(document_id,revision DESC);
CREATE FUNCTION private.tl03_deny_event_change() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $event$
BEGIN
 RAISE EXCEPTION 'TradeLink events are immutable' USING ERRCODE='42501';
END $event$;
CREATE TRIGGER tl03_events_append_only BEFORE UPDATE OR DELETE ON public.tradelink_document_events
 FOR EACH ROW EXECUTE FUNCTION private.tl03_deny_event_change();
REVOKE ALL ON FUNCTION private.tl03_deny_event_change() FROM PUBLIC,anon,authenticated;

ALTER TABLE public.tradelink_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tradelink_document_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tradelink_documents,public.tradelink_document_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.tradelink_document_events_event_id_seq FROM PUBLIC,anon,authenticated;
-- Conservative initial role: existing module General Manager + board manage + active auth.sessions row.
-- The source's system-admin/manager/sales/finance/logistics roles are NOT implicitly mapped.
CREATE FUNCTION private.tl03_can_manage(p_board_id uuid) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $guard$
DECLARE v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT private.wm_board_config_session_active()
  OR p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid THEN
  RETURN false; END IF;
 RETURN coalesce(public.work_board_access(p_board_id,'manage'),false)
  AND coalesce(public.module_role_for('tradelink',v_actor)='General Manager',false)
  AND EXISTS(SELECT 1 FROM public.work_boards b WHERE b.id=p_board_id
   AND b.name='TradeLink' AND b.status='active' AND b.archived_at IS NULL
   AND b.trashed_at IS NULL AND b.workspace_id=public.current_workspace_id(v_actor)
   AND b.description LIKE '[APSYNTRA:MODULE:tradelink:v1]%');
END $guard$;
REVOKE ALL ON FUNCTION private.tl03_can_manage(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_can_manage(uuid) TO authenticated;
GRANT SELECT ON public.tradelink_documents,public.tradelink_document_events TO authenticated;
CREATE POLICY tl03_docs_read ON public.tradelink_documents
 FOR SELECT TO authenticated USING(private.tl03_can_manage(board_id));
CREATE POLICY tl03_events_read ON public.tradelink_document_events
 FOR SELECT TO authenticated USING(private.tl03_can_manage(board_id));
-- No ordinary INSERT/UPDATE/DELETE table grants and no writable RLS policies.

CREATE FUNCTION private.tl03_validate_draft(p_data jsonb) RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $validate$
DECLARE it jsonb; field text;
BEGIN
 IF p_data IS NULL OR pg_catalog.jsonb_typeof(p_data)<>'object'
  OR pg_catalog.octet_length(p_data::text)>131072 THEN
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
  OR p_data->>'documentType' NOT IN ('esi','packing','delivery','payment','quotation','po')
  OR p_data->>'documentNumber' IS NULL
  OR pg_catalog.char_length(p_data->>'documentNumber') NOT BETWEEN 1 AND 120
  OR p_data->>'documentNumber' !~ '^[A-Za-z0-9][A-Za-z0-9._ /-]*
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
 IF p_data ? 'drIncludePricing'
   AND pg_catalog.jsonb_typeof(p_data->'drIncludePricing')<>'boolean' THEN
  RAISE EXCEPTION 'Invalid delivery pricing flag' USING ERRCODE='22023'; END IF;
 IF p_data ? 'items' THEN
  IF pg_catalog.jsonb_typeof(p_data->'items')<>'array'
   OR pg_catalog.jsonb_array_length(p_data->'items')>100 THEN
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
 END IF;
 RETURN p_data;
END $validate$;
REVOKE ALL ON FUNCTION private.tl03_validate_draft(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.tl03_commit(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_operation text,p_data jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $commit$
DECLARE actor uuid:=auth.uid(); d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype; payload jsonb;
 group_id uuid; item_id uuid; rev bigint;
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
   RAISE EXCEPTION 'Creation requires revision zero' USING ERRCODE='40001'; END IF;
  IF d.id IS NOT NULL THEN
   IF d.board_id=p_board_id AND d.created_by=actor AND d.revision=1
    AND d.workflow_state='draft' AND d.archived_at IS NULL AND d.content=payload
    AND EXISTS(SELECT 1 FROM public.work_board_items i
      WHERE i.id=d.board_item_id AND i.board_id=p_board_id
        AND i.title=d.document_number AND i.archived_at IS NULL) THEN
    RETURN pg_catalog.jsonb_build_object('documentId',d.id,'boardItemId',d.board_item_id,
     'revision',1,'state','draft','operation','create','idempotent',true);
   END IF;
   RAISE EXCEPTION 'Existing document ID conflict' USING ERRCODE='40001'; END IF;
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
   RAISE EXCEPTION 'Document stale revision or foreign workspace' USING ERRCODE='40001'; END IF;
  IF d.workflow_state<>'draft' THEN
   RAISE EXCEPTION 'Workflow transitions require separate signed domain API' USING ERRCODE='42501'; END IF;
  SELECT * INTO projection FROM public.work_board_items
   WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
  IF projection.id IS NULL OR projection.title IS DISTINCT FROM d.document_number
   OR (projection.archived_at IS NULL) IS DISTINCT FROM (d.archived_at IS NULL) THEN
   RAISE EXCEPTION 'Board projection drift; reconcile first' USING ERRCODE='40001'; END IF;
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
    WHERE id=d.id RETURNING revision INTO rev;
  ELSIF p_operation='archive' THEN
   IF d.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already archived' USING ERRCODE='40001'; END IF;
   PERFORM public.wm_set_board_item_archived(d.board_item_id,true);
   UPDATE public.tradelink_documents SET archived_at=pg_catalog.clock_timestamp(),
    revision=revision+1,updated_by=actor,updated_at=pg_catalog.clock_timestamp()
    WHERE id=d.id RETURNING revision INTO rev;
  ELSE
   IF d.archived_at IS NULL THEN RAISE EXCEPTION 'Not archived' USING ERRCODE='40001'; END IF;
   PERFORM public.wm_set_board_item_archived(d.board_item_id,false);
   UPDATE public.tradelink_documents SET archived_at=NULL,
    revision=revision+1,updated_by=actor,updated_at=pg_catalog.clock_timestamp()
    WHERE id=d.id RETURNING revision INTO rev;
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
  'revision',rev,'state','draft','operation',p_operation,'idempotent',false);
END $commit$;
REVOKE ALL ON FUNCTION private.tl03_commit(uuid,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_commit(uuid,uuid,bigint,text,jsonb) TO authenticated;

-- Public wrappers are SECURITY INVOKER; no public SECURITY DEFINER endpoint.
CREATE FUNCTION public.tl03_document_commit(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_operation text,p_data jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $rpc$
 SELECT private.tl03_commit(p_board_id,p_document_id,p_expected_revision,p_operation,p_data);
$rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)
 TO authenticated;
CREATE FUNCTION public.tl03_document_read(p_board_id uuid,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $read$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink read denied' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.to_jsonb(d) INTO result FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id AND d.id=p_document_id;
 RETURN result;
END $read$;
REVOKE ALL ON FUNCTION public.tl03_document_read(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_read(uuid,uuid) TO authenticated;
CREATE FUNCTION public.tl03_documents_list(p_board_id uuid,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $list$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink list denied' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Invalid list limit' USING ERRCODE='22023'; END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'documentId',s.id,'boardItemId',s.board_item_id,'documentType',s.document_type,
  'documentNumber',s.document_number,'revision',s.revision,'workflowState',s.workflow_state,
  'archived',s.archived_at IS NOT NULL,'updatedAt',s.updated_at)
  ORDER BY s.updated_at DESC,s.id DESC),'[]'::jsonb)
 INTO result FROM(SELECT * FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id ORDER BY d.updated_at DESC,d.id DESC LIMIT p_limit)s;
 RETURN result;
END $list$;
REVOKE ALL ON FUNCTION public.tl03_documents_list(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_documents_list(uuid,integer) TO authenticated;
-- Source workflow actions, finance projection, and secure file uploads are deliberately absent.
COMMIT;

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
 IF p_data ? 'drIncludePricing'
   AND pg_catalog.jsonb_typeof(p_data->'drIncludePricing')<>'boolean' THEN
  RAISE EXCEPTION 'Invalid delivery pricing flag' USING ERRCODE='22023'; END IF;
 IF p_data ? 'items' THEN
  IF pg_catalog.jsonb_typeof(p_data->'items')<>'array'
   OR pg_catalog.jsonb_array_length(p_data->'items')>100 THEN
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
 END IF;
 RETURN p_data;
END $validate$;
REVOKE ALL ON FUNCTION private.tl03_validate_draft(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.tl03_commit(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_operation text,p_data jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $commit$
DECLARE actor uuid:=auth.uid(); d public.tradelink_documents%rowtype;
 projection public.work_board_items%rowtype; payload jsonb;
 group_id uuid; item_id uuid; rev bigint;
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
   RAISE EXCEPTION 'Creation requires revision zero' USING ERRCODE='40001'; END IF;
  IF d.id IS NOT NULL THEN
   IF d.board_id=p_board_id AND d.created_by=actor AND d.revision=1
    AND d.workflow_state='draft' AND d.archived_at IS NULL AND d.content=payload
    AND EXISTS(SELECT 1 FROM public.work_board_items i
      WHERE i.id=d.board_item_id AND i.board_id=p_board_id
        AND i.title=d.document_number AND i.archived_at IS NULL) THEN
    RETURN pg_catalog.jsonb_build_object('documentId',d.id,'boardItemId',d.board_item_id,
     'revision',1,'state','draft','operation','create','idempotent',true);
   END IF;
   RAISE EXCEPTION 'Existing document ID conflict' USING ERRCODE='40001'; END IF;
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
   RAISE EXCEPTION 'Document stale revision or foreign workspace' USING ERRCODE='40001'; END IF;
  IF d.workflow_state<>'draft' THEN
   RAISE EXCEPTION 'Workflow transitions require separate signed domain API' USING ERRCODE='42501'; END IF;
  SELECT * INTO projection FROM public.work_board_items
   WHERE id=d.board_item_id AND board_id=p_board_id FOR UPDATE;
  IF projection.id IS NULL OR projection.title IS DISTINCT FROM d.document_number
   OR (projection.archived_at IS NULL) IS DISTINCT FROM (d.archived_at IS NULL) THEN
   RAISE EXCEPTION 'Board projection drift; reconcile first' USING ERRCODE='40001'; END IF;
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
    WHERE id=d.id RETURNING revision INTO rev;
  ELSIF p_operation='archive' THEN
   IF d.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Already archived' USING ERRCODE='40001'; END IF;
   PERFORM public.wm_set_board_item_archived(d.board_item_id,true);
   UPDATE public.tradelink_documents SET archived_at=pg_catalog.clock_timestamp(),
    revision=revision+1,updated_by=actor,updated_at=pg_catalog.clock_timestamp()
    WHERE id=d.id RETURNING revision INTO rev;
  ELSE
   IF d.archived_at IS NULL THEN RAISE EXCEPTION 'Not archived' USING ERRCODE='40001'; END IF;
   PERFORM public.wm_set_board_item_archived(d.board_item_id,false);
   UPDATE public.tradelink_documents SET archived_at=NULL,
    revision=revision+1,updated_by=actor,updated_at=pg_catalog.clock_timestamp()
    WHERE id=d.id RETURNING revision INTO rev;
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
  'revision',rev,'state','draft','operation',p_operation,'idempotent',false);
END $commit$;
REVOKE ALL ON FUNCTION private.tl03_commit(uuid,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_commit(uuid,uuid,bigint,text,jsonb) TO authenticated;

-- Public wrappers are SECURITY INVOKER; no public SECURITY DEFINER endpoint.
CREATE FUNCTION public.tl03_document_commit(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint,p_operation text,p_data jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $rpc$
 SELECT private.tl03_commit(p_board_id,p_document_id,p_expected_revision,p_operation,p_data);
$rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_commit(uuid,uuid,bigint,text,jsonb)
 TO authenticated;
CREATE FUNCTION public.tl03_document_read(p_board_id uuid,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $read$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink read denied' USING ERRCODE='42501'; END IF;
 SELECT pg_catalog.to_jsonb(d) INTO result FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id AND d.id=p_document_id;
 RETURN result;
END $read$;
REVOKE ALL ON FUNCTION public.tl03_document_read(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_read(uuid,uuid) TO authenticated;
CREATE FUNCTION public.tl03_documents_list(p_board_id uuid,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $list$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink list denied' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Invalid list limit' USING ERRCODE='22023'; END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'documentId',s.id,'boardItemId',s.board_item_id,'documentType',s.document_type,
  'documentNumber',s.document_number,'revision',s.revision,'workflowState',s.workflow_state,
  'archived',s.archived_at IS NOT NULL,'updatedAt',s.updated_at)
  ORDER BY s.updated_at DESC,s.id DESC),'[]'::jsonb)
 INTO result FROM(SELECT * FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id ORDER BY d.updated_at DESC,d.id DESC LIMIT p_limit)s;
 RETURN result;
END $list$;
REVOKE ALL ON FUNCTION public.tl03_documents_list(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_documents_list(uuid,integer) TO authenticated;
-- Source workflow actions, finance projection, and secure file uploads are deliberately absent.
COMMIT;
