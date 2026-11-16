-- CP-TL-LEGACY-02: authoritative document numbering, persisted dates and
-- currency-safe quotation / tax / receivables reporting.
-- Additive candidate only. Do not apply to production without the controlled
-- activation step and genuine signed runtime acceptance.
BEGIN;

DO $preflight$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regclass('public.work_board_items') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('private.tl03_save(uuid,uuid,bigint,text,jsonb,text)') IS NULL
  OR to_regprocedure('private.tl03_validate_draft(jsonb)') IS NULL
  OR to_regprocedure('public.tl03_analytics_summary(uuid,timestamptz,timestamptz)') IS NULL
  OR to_regprocedure('public.tl03_document_create(uuid,uuid,jsonb,text)') IS NOT NULL
  OR to_regclass('private.tradelink_document_sequences') IS NOT NULL
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.tradelink_documents'::regclass
    AND tgname='tradelink_document_number_immutable' AND NOT tgisinternal)
  OR to_regprocedure('private.tl03_guard_document_number_immutable()') IS NOT NULL
  OR NOT has_function_privilege('authenticated',
    'public.tl03_analytics_summary(uuid,timestamptz,timestamptz)','EXECUTE')
  OR NOT has_schema_privilege('authenticated','private','USAGE')
  OR NOT has_function_privilege('authenticated',
    'private.tl03_save(uuid,uuid,bigint,text,jsonb,text)','EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink legacy workflow prerequisites or duplicate installation detected'
  USING ERRCODE='42501'; END IF;
END $preflight$;

-- Keep the existing allow-list and field limits. Date strings are ISO calendar
-- dates; legacy dueDate remains optional, matching the original application.
CREATE OR REPLACE FUNCTION private.tl03_validate_draft(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $validate$
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

CREATE TABLE private.tradelink_document_sequences(
 board_id uuid NOT NULL,
 workspace_id uuid NOT NULL,
 document_type text NOT NULL CHECK(document_type IN ('esi','packing','delivery','payment','quotation','po')),
 next_number bigint NOT NULL CHECK(next_number>=11130),
 updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(board_id,workspace_id,document_type)
);
REVOKE ALL ON TABLE private.tradelink_document_sequences FROM PUBLIC,anon,authenticated;

-- A number is assigned once at creation and remains stable for every later
-- revision. Enforce this at the table boundary, not only in the read-only UI.
CREATE FUNCTION private.tl03_guard_document_number_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $guard$
BEGIN
 IF NEW.document_number IS DISTINCT FROM OLD.document_number THEN
  RAISE EXCEPTION 'TradeLink document numbers cannot be changed after creation'
   USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $guard$;
CREATE TRIGGER tradelink_document_number_immutable
 BEFORE UPDATE OF document_number ON public.tradelink_documents
 FOR EACH ROW EXECUTE FUNCTION private.tl03_guard_document_number_immutable();

-- One transaction assigns a legacy-compatible number and calls the existing
-- atomic save function. Retries reuse the number already committed for the
-- same stable document ID; failed saves roll the sequence increment back.
CREATE FUNCTION private.tl03_create_document(
 p_board_id uuid,p_document_id uuid,p_data jsonb,
 p_initial_state text DEFAULT 'for-approval'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $create$
DECLARE
 actor uuid:=auth.uid(); actor_workspace uuid; existing public.tradelink_documents%rowtype;
 prefix text; assigned_number text; next_value bigint; payload jsonb; receipt jsonb;
BEGIN
 IF actor IS NULL OR private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink document manager required' USING ERRCODE='42501'; END IF;
 IF p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR p_document_id IS NULL OR p_initial_state NOT IN ('draft','for-approval')
  OR p_initial_state IS NULL OR p_data IS NULL
  OR pg_catalog.jsonb_typeof(p_data)<>'object'
  OR pg_catalog.jsonb_typeof(p_data->'documentType') IS DISTINCT FROM 'string'
  OR p_data->>'documentType' NOT IN ('esi','packing','delivery','payment','quotation','po')
  OR coalesce(p_data->>'documentNumber','')<>'' THEN
  RAISE EXCEPTION 'Invalid TradeLink automatic-number create command' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_document_id::text,0));
 SELECT * INTO existing FROM public.tradelink_documents WHERE id=p_document_id;
 IF existing.id IS NOT NULL THEN
  assigned_number:=existing.document_number;
  payload:=p_data||pg_catalog.jsonb_build_object('documentNumber',assigned_number);
 ELSE
  actor_workspace:=public.current_workspace_id(actor);
  prefix:=CASE p_data->>'documentType'
   WHEN 'esi' THEN 'ESI-' WHEN 'packing' THEN 'PL-'
   WHEN 'delivery' THEN 'DR-' WHEN 'payment' THEN 'AR-'
   WHEN 'quotation' THEN 'Q-' WHEN 'po' THEN 'PO-' END;
  SELECT greatest(11130,coalesce(max(pg_catalog.substr(d.document_number,pg_catalog.char_length(prefix)+1)::bigint)+1,11130))
  INTO next_value
  FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id AND d.workspace_id=actor_workspace
   AND d.document_type=p_data->>'documentType'
   AND d.document_number ~ ('^'||prefix||'[0-9]{6,}$');
  INSERT INTO private.tradelink_document_sequences(
   board_id,workspace_id,document_type,next_number)
  VALUES(p_board_id,actor_workspace,p_data->>'documentType',next_value)
  ON CONFLICT(board_id,workspace_id,document_type) DO NOTHING;
  SELECT s.next_number INTO next_value
  FROM private.tradelink_document_sequences s
  WHERE s.board_id=p_board_id AND s.workspace_id=actor_workspace
   AND s.document_type=p_data->>'documentType'
  FOR UPDATE;
  -- Reconcile with existing records on every allocation so a prior manual
  -- import cannot make the sequence move backwards.
  SELECT greatest(next_value,coalesce(max(pg_catalog.substr(d.document_number,pg_catalog.char_length(prefix)+1)::bigint)+1,11130))
  INTO next_value
  FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id AND d.workspace_id=actor_workspace
   AND d.document_type=p_data->>'documentType'
   AND d.document_number ~ ('^'||prefix||'[0-9]{6,}$');
  LOOP
   assigned_number:=prefix||pg_catalog.lpad(next_value::text,6,'0');
   EXIT WHEN NOT EXISTS(SELECT 1 FROM public.tradelink_documents d
    WHERE d.board_id=p_board_id AND d.workspace_id=actor_workspace
     AND d.document_number=assigned_number);
   next_value:=next_value+1;
   IF next_value>9223372036854775000 THEN
    RAISE EXCEPTION 'TradeLink document number sequence exhausted' USING ERRCODE='22003'; END IF;
  END LOOP;
  UPDATE private.tradelink_document_sequences
  SET next_number=next_value+1,updated_at=pg_catalog.clock_timestamp()
  WHERE board_id=p_board_id AND workspace_id=actor_workspace
   AND document_type=p_data->>'documentType';
  payload:=p_data||pg_catalog.jsonb_build_object('documentNumber',assigned_number);
 END IF;
 receipt:=private.tl03_save(p_board_id,p_document_id,0,'create',payload,p_initial_state);
 RETURN receipt||pg_catalog.jsonb_build_object('documentNumber',assigned_number);
END $create$;

REVOKE ALL ON FUNCTION private.tl03_create_document(uuid,uuid,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.tl03_create_document(uuid,uuid,jsonb,text)
 TO authenticated;
CREATE FUNCTION public.tl03_document_create(
 p_board_id uuid,p_document_id uuid,p_data jsonb,
 p_initial_state text DEFAULT 'for-approval'
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $rpc$
 SELECT private.tl03_create_document(p_board_id,p_document_id,p_data,p_initial_state);
$rpc$;
REVOKE ALL ON FUNCTION public.tl03_document_create(uuid,uuid,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_document_create(uuid,uuid,jsonb,text)
 TO authenticated;

-- Extend the existing aggregate RPC without changing its signature or its
-- signed manager/workspace boundary. All monetary aggregates remain separated
-- by ISO currency; no FX conversion or inferred rates are applied.
CREATE OR REPLACE FUNCTION public.tl03_analytics_summary(
 p_board_id uuid,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $analytics$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink manager access required' USING ERRCODE='42501'; END IF;
 IF p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_to<=p_from)
 THEN RAISE EXCEPTION 'Invalid TradeLink analytics period' USING ERRCODE='22023'; END IF;
 WITH all_scoped AS MATERIALIZED (
  SELECT d.document_number,d.document_type,d.workflow_state,d.content,d.created_at,
   CASE WHEN d.content->>'currency' IN
    ('PHP','USD','EUR','GBP','JPY','CNY','SGD','AUD','SAR')
    THEN d.content->>'currency' ELSE 'UNSPECIFIED' END AS currency,
   coalesce(nullif(d.content->>'vatType',''),'unspecified') AS vat_type,
   CASE WHEN d.content->>'quoteStatus' IN
    ('Working on it','Sent','Client Review','Accepted','Declined','On Hold','Closed')
    THEN d.content->>'quoteStatus' ELSE 'unspecified' END AS quote_status,
   CASE WHEN d.content->>'dueDate' ~ '^\d{4}-\d{2}-\d{2}$'
    AND pg_catalog.pg_input_is_valid(d.content->>'dueDate','date')
    THEN (d.content->>'dueDate')::date ELSE NULL END AS due_date,
   coalesce(d.content->>'referenceNumber','') AS payment_reference,
   CASE WHEN d.content->>'cashAmount' ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (d.content->>'cashAmount')::numeric ELSE 0::numeric END AS cash_amount,
   CASE WHEN d.content->>'chequeAmount' ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (d.content->>'chequeAmount')::numeric ELSE 0::numeric END AS cheque_amount
  FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id
   AND d.workspace_id=public.current_workspace_id(auth.uid())
   AND d.archived_at IS NULL
 ), scoped AS MATERIALIZED (
  SELECT * FROM all_scoped
  WHERE (p_from IS NULL OR created_at>=p_from)
   AND (p_to IS NULL OR created_at<p_to)
 ), line_totals AS (
  SELECT s.*,
   coalesce((SELECT sum(
    CASE WHEN pg_catalog.jsonb_typeof(item->'quantity')='number'
      THEN (item->>'quantity')::numeric ELSE 0 END *
    CASE WHEN pg_catalog.jsonb_typeof(item->'unitPrice')='number'
      THEN (item->>'unitPrice')::numeric ELSE 0 END)
    FROM pg_catalog.jsonb_array_elements(
     CASE WHEN pg_catalog.jsonb_typeof(s.content->'items')='array'
      THEN s.content->'items' ELSE '[]'::jsonb END) item
    WHERE coalesce(item->>'kind','item')='item'),0) AS subtotal
  FROM scoped s
 ), discounted AS (
  SELECT l.*,
   CASE WHEN l.content->>'discountValue' ~ '^[0-9]+(\.[0-9]+)?$'
    THEN (l.content->>'discountValue')::numeric ELSE 0 END AS discount_input
  FROM line_totals l
 ), priced AS (
  SELECT d.*,
   CASE WHEN d.content->>'discountType'='percentage'
    THEN least(d.subtotal,d.subtotal*least(greatest(d.discount_input,0),100)/100)
    ELSE least(d.subtotal,greatest(d.discount_input,0)) END AS discount
  FROM discounted d
 ), totals AS (
  SELECT p.*,
   greatest(p.subtotal-p.discount,0) AS taxable,
   CASE p.vat_type WHEN '12' THEN 0.12::numeric
    WHEN '15_tkm' THEN 0.15::numeric WHEN '15_ksa' THEN 0.15::numeric
    ELSE 0::numeric END AS vat_rate
  FROM priced p
 ), aging_line_totals AS (
  SELECT s.*,
   coalesce((SELECT sum(
    CASE WHEN pg_catalog.jsonb_typeof(item->'quantity')='number'
      THEN (item->>'quantity')::numeric ELSE 0 END *
    CASE WHEN pg_catalog.jsonb_typeof(item->'unitPrice')='number'
      THEN (item->>'unitPrice')::numeric ELSE 0 END)
    FROM pg_catalog.jsonb_array_elements(
     CASE WHEN pg_catalog.jsonb_typeof(s.content->'items')='array'
      THEN s.content->'items' ELSE '[]'::jsonb END) item
    WHERE coalesce(item->>'kind','item')='item'),0) AS subtotal
  FROM all_scoped s
 ), aging_discounted AS (
  SELECT l.*,CASE WHEN l.content->>'discountValue' ~ '^[0-9]+(\.[0-9]+)?$'
   THEN (l.content->>'discountValue')::numeric ELSE 0 END AS discount_input
  FROM aging_line_totals l
 ), aging_priced AS (
  SELECT d.*,CASE WHEN d.content->>'discountType'='percentage'
   THEN least(d.subtotal,d.subtotal*least(greatest(d.discount_input,0),100)/100)
   ELSE least(d.subtotal,greatest(d.discount_input,0)) END AS discount
  FROM aging_discounted d
 ), aging_totals AS (
  SELECT p.*,greatest(p.subtotal-p.discount,0) AS taxable,
   CASE p.vat_type WHEN '12' THEN 0.12::numeric
    WHEN '15_tkm' THEN 0.15::numeric WHEN '15_ksa' THEN 0.15::numeric
    ELSE 0::numeric END AS vat_rate
  FROM aging_priced p
 ), invoices AS (
  SELECT t.document_number,t.currency,t.due_date,
   (t.taxable+t.taxable*t.vat_rate)::numeric AS invoice_total
  FROM aging_totals t WHERE t.document_type='esi' AND t.workflow_state='approved'
   AND t.due_date IS NOT NULL
 ), cash_by_invoice AS (
  SELECT p.payment_reference,p.currency,sum(p.cash_amount)::numeric AS paid
  FROM aging_totals p WHERE p.document_type='payment' AND p.workflow_state='completed'
   AND p.cash_amount>0 AND p.payment_reference<>''
  GROUP BY p.payment_reference,p.currency
 ), invoice_balances AS (
  SELECT i.*,coalesce(p.paid,0)::numeric AS paid,
   greatest(i.invoice_total-coalesce(p.paid,0),0)::numeric AS outstanding,
   greatest(coalesce(p.paid,0)-i.invoice_total,0)::numeric AS excess
  FROM invoices i LEFT JOIN cash_by_invoice p
   ON p.payment_reference=i.document_number AND p.currency=i.currency
 ), unmatched_cash AS (
  SELECT p.currency,count(*)::integer AS receipt_count,sum(p.cash_amount)::numeric AS amount
  FROM aging_totals p WHERE p.document_type='payment' AND p.workflow_state='completed'
   AND p.cash_amount>0 AND NOT EXISTS(SELECT 1 FROM aging_totals e
    WHERE e.document_type='esi' AND e.workflow_state='approved'
     AND e.document_number=p.payment_reference AND e.currency=p.currency)
  GROUP BY p.currency
 ), excess_cash AS (
  SELECT b.currency,count(*)::integer AS receipt_count,sum(b.excess)::numeric AS amount
  FROM invoice_balances b WHERE b.excess>0 GROUP BY b.currency
 ), pending_cheques AS (
  SELECT p.currency,count(*)::integer AS receipt_count,sum(p.cheque_amount)::numeric AS amount
  FROM aging_totals p WHERE p.document_type='payment' AND p.workflow_state='completed'
   AND p.cheque_amount>0 GROUP BY p.currency
 ), aging_buckets AS (
  SELECT b.currency,
   CASE WHEN b.due_date>=current_date THEN 'Current'
    WHEN current_date-b.due_date<=30 THEN '1-30 days'
    WHEN current_date-b.due_date<=60 THEN '31-60 days'
    WHEN current_date-b.due_date<=90 THEN '61-90 days'
    ELSE 'Over 90 days' END AS bucket,
   count(*)::integer AS invoice_count,sum(b.outstanding)::numeric AS outstanding
  FROM invoice_balances b GROUP BY b.currency,
   CASE WHEN b.due_date>=current_date THEN 'Current'
    WHEN current_date-b.due_date<=30 THEN '1-30 days'
    WHEN current_date-b.due_date<=60 THEN '31-60 days'
    WHEN current_date-b.due_date<=90 THEN '61-90 days'
    ELSE 'Over 90 days' END
 )
 SELECT pg_catalog.jsonb_build_object(
  'generatedAt',pg_catalog.clock_timestamp(),
  'documentCounts',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'documentType',x.document_type,'workflowState',x.workflow_state,'count',x.count)
   ORDER BY x.document_type,x.workflow_state)
   FROM (SELECT document_type,workflow_state,count(*)::integer AS count
    FROM scoped GROUP BY document_type,workflow_state) x),'[]'::jsonb),
  'quotationPerformance',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'workflowState',x.workflow_state,'currency',x.currency,'count',x.count,'total',x.total)
   ORDER BY x.workflow_state,x.currency)
   FROM (SELECT workflow_state,currency,count(*)::integer AS count,
    sum(taxable+taxable*vat_rate)::numeric AS total
    FROM totals WHERE document_type='quotation' GROUP BY workflow_state,currency) x),'[]'::jsonb),
  'quotationCommercialStatus',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'quoteStatus',x.quote_status,'currency',x.currency,'count',x.count,'total',x.total)
   ORDER BY x.quote_status,x.currency)
   FROM (SELECT quote_status,currency,count(*)::integer AS count,
    sum(taxable+taxable*vat_rate)::numeric AS total
    FROM totals WHERE document_type='quotation' GROUP BY quote_status,currency) x),'[]'::jsonb),
  'taxSummary',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'currency',x.currency,'vatType',x.vat_type,'invoiceCount',x.invoice_count,
   'taxable',x.taxable,'vat',x.vat,'total',x.total)
   ORDER BY x.currency,x.vat_type)
   FROM (SELECT currency,vat_type,count(*)::integer AS invoice_count,
    sum(taxable)::numeric AS taxable,sum(taxable*vat_rate)::numeric AS vat,
    sum(taxable+taxable*vat_rate)::numeric AS total
    FROM totals WHERE document_type='esi' AND workflow_state='approved'
    GROUP BY currency,vat_type) x),'[]'::jsonb),
  'aging',pg_catalog.jsonb_build_object(
   'available',TRUE,
   'reason','Aging uses approved ESI invoices with a due date. Only completed cash Payment AR records with an exact ESI document-number reference and matching currency reduce receivables. Cheques remain pending bank clearance.',
   'buckets',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency',currency,'bucket',bucket,'invoiceCount',invoice_count,'outstanding',outstanding)
    ORDER BY currency,CASE bucket WHEN 'Current' THEN 0 WHEN '1-30 days' THEN 1
     WHEN '31-60 days' THEN 2 WHEN '61-90 days' THEN 3 ELSE 4 END)
    FROM aging_buckets),'[]'::jsonb),
   'unallocatedReceipts',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency',currency,'count',receipt_count,'amount',amount) ORDER BY currency)
    FROM unmatched_cash),'[]'::jsonb),
   'excessPayments',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency',currency,'count',receipt_count,'amount',amount) ORDER BY currency)
    FROM excess_cash),'[]'::jsonb),
   'pendingChequeReceipts',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency',currency,'count',receipt_count,'amount',amount) ORDER BY currency)
    FROM pending_cheques),'[]'::jsonb),
   'excludedWithoutDueDate',(SELECT count(*)::integer FROM aging_totals
    WHERE document_type='esi' AND workflow_state='approved' AND due_date IS NULL)
  )
 ) INTO result;
 RETURN result;
END $analytics$;

DO $postflight$
BEGIN
 IF NOT has_function_privilege('authenticated',
   'public.tl03_document_create(uuid,uuid,jsonb,text)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_document_create(uuid,uuid,jsonb,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated',
   'private.tl03_create_document(uuid,uuid,jsonb,text)','EXECUTE')
  OR has_function_privilege('anon',
   'private.tl03_create_document(uuid,uuid,jsonb,text)','EXECUTE')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
   p.oid='private.tl03_create_document(uuid,uuid,jsonb,text)'::regprocedure
   AND p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[]
   AND p.proowner=(SELECT proowner FROM pg_catalog.pg_proc
    WHERE oid='private.tl03_save(uuid,uuid,bigint,text,jsonb,text)'::regprocedure))
  OR has_table_privilege('authenticated','private.tradelink_document_sequences','SELECT')
  OR has_table_privilege('authenticated','private.tradelink_document_sequences','INSERT')
  OR has_table_privilege('anon','private.tradelink_document_sequences','SELECT')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
   p.oid='public.tl03_document_create(uuid,uuid,jsonb,text)'::regprocedure
   AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
   p.oid='public.tl03_analytics_summary(uuid,timestamptz,timestamptz)'::regprocedure
   AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE
   t.tgrelid='public.tradelink_documents'::regclass
   AND t.tgname='tradelink_document_number_immutable' AND t.tgenabled='O'
   AND NOT t.tgisinternal)
 THEN RAISE EXCEPTION 'TradeLink numbering/analytics function ACL or execution posture drift'
  USING ERRCODE='42501'; END IF;
END $postflight$;
COMMIT;
