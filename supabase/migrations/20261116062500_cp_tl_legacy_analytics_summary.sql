-- CP-TL-LEGACY-01: aggregate-only TradeLink quotation and tax analytics.
-- SOURCE-ONLY CANDIDATE. Do not apply to production without separate approval
-- for this new authenticated-executable RPC. It reuses the existing manager
-- predicate and does not change roles, grants, RLS, document writes or Storage.
BEGIN;

DO $preflight$
BEGIN
 IF to_regclass('public.tradelink_documents') IS NULL
  OR to_regprocedure('private.tl03_can_manage(uuid)') IS NULL
  OR to_regprocedure('public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)') IS NULL
  OR to_regprocedure('public.tl03_analytics_summary(uuid,timestamptz,timestamptz)') IS NOT NULL
  OR NOT has_function_privilege('authenticated',
   'public.tl03_documents_page(uuid,text,text,text,text,timestamptz,uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'TradeLink analytics prerequisites or duplicate installation detected'
  USING ERRCODE='42501'; END IF;
END $preflight$;

CREATE FUNCTION public.tl03_analytics_summary(
 p_board_id uuid,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $analytics$
DECLARE result jsonb;
BEGIN
 IF private.tl03_can_manage(p_board_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Signed TradeLink manager access required' USING ERRCODE='42501'; END IF;
 IF p_board_id IS DISTINCT FROM '264ca40d-6e4a-4e4f-97e6-3bd77c97cd88'::uuid
  OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_to<=p_from)
 THEN RAISE EXCEPTION 'Invalid TradeLink analytics period' USING ERRCODE='22023'; END IF;

 WITH scoped AS MATERIALIZED (
  SELECT d.document_type,d.workflow_state,d.content,d.created_at,
   CASE WHEN d.content->>'currency' IN
    ('PHP','USD','EUR','GBP','JPY','CNY','SGD','AUD','SAR')
    THEN d.content->>'currency' ELSE 'UNSPECIFIED' END AS currency,
   coalesce(nullif(d.content->>'vatType',''),'unspecified') AS vat_type
  FROM public.tradelink_documents d
  WHERE d.board_id=p_board_id
   AND d.workspace_id=public.current_workspace_id(auth.uid())
   AND d.archived_at IS NULL
   AND (p_from IS NULL OR d.created_at>=p_from)
   AND (p_to IS NULL OR d.created_at<p_to)
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
 )
 SELECT pg_catalog.jsonb_build_object(
  'generatedAt',pg_catalog.clock_timestamp(),
  'documentCounts',coalesce((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'documentType',x.document_type,'workflowState',x.workflow_state,'count',x.count)
    ORDER BY x.document_type,x.workflow_state)
   FROM (SELECT document_type,workflow_state,count(*)::integer AS count
    FROM scoped GROUP BY document_type,workflow_state) x),'[]'::jsonb),
  'quotationPerformance',coalesce((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'workflowState',x.workflow_state,'currency',x.currency,
    'count',x.count,'total',x.total)
    ORDER BY x.workflow_state,x.currency)
   FROM (SELECT workflow_state,currency,count(*)::integer AS count,
    sum(taxable+taxable*vat_rate)::numeric AS total
    FROM totals WHERE document_type='quotation'
    GROUP BY workflow_state,currency) x),'[]'::jsonb),
  'taxSummary',coalesce((
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency',x.currency,'vatType',x.vat_type,'invoiceCount',x.invoice_count,
    'taxable',x.taxable,'vat',x.vat,'total',x.total)
    ORDER BY x.currency,x.vat_type)
   FROM (SELECT currency,vat_type,count(*)::integer AS invoice_count,
    sum(taxable)::numeric AS taxable,sum(taxable*vat_rate)::numeric AS vat,
    sum(taxable+taxable*vat_rate)::numeric AS total
    FROM totals WHERE document_type='esi' AND workflow_state='approved'
    GROUP BY currency,vat_type) x),'[]'::jsonb),
  'aging',pg_catalog.jsonb_build_object('available',FALSE,
   'reason','Aging cannot be calculated yet: TradeLink records do not define invoice due dates, payment-to-invoice allocations, or authoritative outstanding balances.')
 ) INTO result;
 RETURN result;
END $analytics$;

REVOKE ALL ON FUNCTION public.tl03_analytics_summary(uuid,timestamptz,timestamptz)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tl03_analytics_summary(uuid,timestamptz,timestamptz)
 TO authenticated;

DO $postflight$
BEGIN
 IF NOT has_function_privilege('authenticated',
   'public.tl03_analytics_summary(uuid,timestamptz,timestamptz)','EXECUTE')
  OR has_function_privilege('anon',
   'public.tl03_analytics_summary(uuid,timestamptz,timestamptz)','EXECUTE')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE
   p.oid='public.tl03_analytics_summary(uuid,timestamptz,timestamptz)'::regprocedure
   AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=""']::text[])
 THEN RAISE EXCEPTION 'TradeLink analytics RPC permission or invoker posture drift'
  USING ERRCODE='42501'; END IF;
END $postflight$;
COMMIT;
