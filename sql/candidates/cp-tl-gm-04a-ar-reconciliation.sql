-- CP-TL-GM-04A: candidate only; do not apply automatically to production.
-- Existing signed manager capability and approval evidence remain authoritative.
BEGIN;
CREATE TABLE IF NOT EXISTS private.tradelink_cheque_clearances (
 document_id uuid NOT NULL REFERENCES public.tradelink_documents(id),
 document_revision bigint NOT NULL CHECK (document_revision>0),
 actor_id uuid NOT NULL,
 cleared_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY(document_id,document_revision)
);
REVOKE ALL ON private.tradelink_cheque_clearances FROM PUBLIC, anon, authenticated;

-- Narrow internal projection: no direct exposure of approval history or clearance table.
CREATE OR REPLACE FUNCTION private.tl03_ar_eligible_payments(p_board_id uuid)
RETURNS TABLE(document_id uuid,cheque_cleared boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT d.id,EXISTS(SELECT 1 FROM private.tradelink_cheque_clearances c
  WHERE c.document_id=d.id AND c.document_revision=d.revision)
 FROM public.tradelink_documents d
 WHERE private.tl03_can_manage(p_board_id) IS TRUE
 AND d.board_id=p_board_id AND d.workspace_id=public.current_workspace_id(auth.uid())
 AND d.document_type='payment' AND d.workflow_state IN ('closed','completed')
 AND d.archived_at IS NULL AND d.deleted_at IS NULL
 AND private.tl03_approval_evidence_complete(d.id,d.revision) IS TRUE
$fn$;

CREATE OR REPLACE FUNCTION private.tl03_record_cheque_clearance(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE d public.tradelink_documents%ROWTYPE;
 c private.tradelink_cheque_clearances%ROWTYPE;
 inserted boolean;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink manager required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO d FROM public.tradelink_documents
 WHERE id=p_document_id AND board_id=p_board_id
 AND workspace_id=public.current_workspace_id(auth.uid()) FOR UPDATE;
 IF NOT FOUND OR d.revision IS DISTINCT FROM p_expected_revision
 OR d.document_type<>'payment' OR d.workflow_state NOT IN ('closed','completed')
 OR d.archived_at IS NOT NULL OR d.deleted_at IS NOT NULL
 OR private.tl03_approval_evidence_complete(d.id,d.revision) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Payment must be current, finalized and signed' USING ERRCODE='PT409';
 END IF;
 IF CASE WHEN d.content->>'chequeAmount' ~ '^[0-9]+(\\.[0-9]+)?$'
   THEN (d.content->>'chequeAmount')::numeric<=0 ELSE TRUE END
 OR coalesce(btrim(d.content->>'bankName'),'')=''
 OR coalesce(btrim(d.content->>'chequeNumber'),'')='' THEN
  RAISE EXCEPTION 'Valid cheque details required' USING ERRCODE='22023';
 END IF;
 INSERT INTO private.tradelink_cheque_clearances(document_id,document_revision,actor_id)
 VALUES(d.id,d.revision,auth.uid()) ON CONFLICT(document_id,document_revision) DO NOTHING
 RETURNING * INTO c;
 inserted:=FOUND;
 IF NOT inserted THEN
  SELECT * INTO STRICT c FROM private.tradelink_cheque_clearances
  WHERE document_id=d.id AND document_revision=d.revision;
 END IF;
 RETURN pg_catalog.jsonb_build_object('documentId',d.id,'revision',d.revision,
  'clearedAt',c.cleared_at,'idempotent',NOT inserted);
END $fn$;

CREATE OR REPLACE FUNCTION public.tl03_record_cheque_clearance(
 p_board_id uuid,p_document_id uuid,p_expected_revision bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 SELECT private.tl03_record_cheque_clearance(p_board_id,p_document_id,p_expected_revision)
$fn$;
REVOKE ALL ON FUNCTION private.tl03_ar_eligible_payments(uuid),
 private.tl03_record_cheque_clearance(uuid,uuid,bigint),
 public.tl03_record_cheque_clearance(uuid,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.tl03_ar_eligible_payments(uuid),
 private.tl03_record_cheque_clearance(uuid,uuid,bigint),
 public.tl03_record_cheque_clearance(uuid,uuid,bigint) TO authenticated;

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
 WITH eligible_payments AS MATERIALIZED (
  SELECT * FROM private.tl03_ar_eligible_payments(p_board_id)
 ), all_scoped AS MATERIALIZED (
  SELECT d.document_number,d.document_type,d.workflow_state,d.content,d.created_at,
   ep.document_id IS NOT NULL AS payment_eligible,
   coalesce(ep.cheque_cleared,false) AS cheque_cleared,
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
  LEFT JOIN eligible_payments ep ON ep.document_id=d.id
  WHERE d.board_id=p_board_id
   AND d.workspace_id=public.current_workspace_id(auth.uid())
   AND d.archived_at IS NULL AND d.deleted_at IS NULL
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
   AND t.currency<>'UNSPECIFIED'
 ), cash_by_invoice AS (
  SELECT p.payment_reference,p.currency,sum(p.cash_amount+CASE WHEN p.cheque_cleared THEN p.cheque_amount ELSE 0 END)::numeric AS paid
  FROM aging_totals p WHERE p.payment_eligible
   AND p.currency<>'UNSPECIFIED' AND (p.cash_amount>0 OR (p.cheque_cleared AND p.cheque_amount>0)) AND p.payment_reference<>''
  GROUP BY p.payment_reference,p.currency
 ), invoice_balances AS (
  SELECT i.*,coalesce(p.paid,0)::numeric AS paid,
   greatest(i.invoice_total-coalesce(p.paid,0),0)::numeric AS outstanding,
   greatest(coalesce(p.paid,0)-i.invoice_total,0)::numeric AS excess
  FROM invoices i LEFT JOIN cash_by_invoice p
   ON p.payment_reference=i.document_number AND p.currency=i.currency
 ), unmatched_cash AS (
  SELECT p.currency,count(*)::integer AS receipt_count,
   sum(p.cash_amount+CASE WHEN p.cheque_cleared THEN p.cheque_amount ELSE 0 END)::numeric AS amount
  FROM aging_totals p WHERE p.payment_eligible
   AND (p.cash_amount>0 OR (p.cheque_cleared AND p.cheque_amount>0)) AND NOT EXISTS(SELECT 1 FROM aging_totals e
    WHERE e.document_type='esi' AND e.workflow_state='approved'
     AND e.document_number=p.payment_reference AND e.currency=p.currency AND p.currency<>'UNSPECIFIED')
  GROUP BY p.currency
 ), excess_cash AS (
  SELECT b.currency,count(*)::integer AS receipt_count,sum(b.excess)::numeric AS amount
  FROM invoice_balances b WHERE b.excess>0 GROUP BY b.currency
 ), pending_cheques AS (
  SELECT p.currency,count(*)::integer AS receipt_count,sum(p.cheque_amount)::numeric AS amount
  FROM aging_totals p WHERE p.payment_eligible AND NOT p.cheque_cleared
   AND p.cheque_amount>0 GROUP BY p.currency
 ), aging_buckets AS (
  SELECT b.currency,
   CASE WHEN b.due_date>=current_date THEN 'Current'
    WHEN current_date-b.due_date<=30 THEN '1-30 days'
    WHEN current_date-b.due_date<=60 THEN '31-60 days'
    WHEN current_date-b.due_date<=90 THEN '61-90 days'
    ELSE 'Over 90 days' END AS bucket,
   count(*)::integer AS invoice_count,sum(b.outstanding)::numeric AS outstanding
  FROM invoice_balances b WHERE b.outstanding>0 AND b.due_date IS NOT NULL GROUP BY b.currency,
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
   'reason','Aging uses open approved ESI invoices with a due date. Signed finalized cash and cleared cheque payments reduce receivables only for an exact invoice-number reference and matching known currency. Pending cheques do not reduce balances.',
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
COMMIT;
