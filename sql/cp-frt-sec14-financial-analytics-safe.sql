-- CP-FRT-EXEC-02: signed company-scoped aggregate-only finance projection.
-- Additive read RPC. Apply only after disposable acceptance and approved activation.
-- No table grants, role changes, RLS changes, writes, or legacy RPC cutover.
BEGIN;

DO $preflight$
BEGIN
 IF to_regprocedure('private.frt_current_role(uuid)') IS NULL OR
    to_regclass('public.frt_companies') IS NULL OR
    to_regclass('public.frt_requests') IS NULL OR
    to_regclass('public.frt_request_items') IS NULL OR
    to_regclass('public.frt_liquidations') IS NULL THEN
  RAISE EXCEPTION 'CP-FRT-EXEC-02 authoritative FRT dependencies absent'
   USING ERRCODE='55000';
 END IF;
 IF to_regprocedure('public.frt_board_financial_analytics_safe(uuid,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'CP-FRT-EXEC-02 analytics RPC already exists; inspect before activation'
   USING ERRCODE='55000';
 END IF;
END;
$preflight$;

CREATE FUNCTION public.frt_board_financial_analytics_safe(
 p_workspace_id uuid,
 p_company text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
 v_role text;
 v_company_id uuid;
 v_requested numeric;
 v_spent numeric;
 v_categories jsonb;
 v_months jsonb;
 v_current_month date;
BEGIN
 -- Reuse the existing signed FRT membership/session resolver. Do not
 -- introduce new role requirements or rely on caller-supplied identity.
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 v_role := private.frt_current_role(p_workspace_id);
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;

 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' THEN
  RAISE EXCEPTION 'Invalid FRT company' USING ERRCODE='22023';
 END IF;

 -- Resolve the company inside the active workspace. No cross-workspace
 -- company identifiers or caller-provided company UUIDs are accepted.
 SELECT c.id INTO v_company_id
 FROM public.frt_companies AS c
 WHERE c.workspace_id=p_workspace_id AND c.code=p_company;
 IF v_company_id IS NULL THEN
  RAISE EXCEPTION 'FRT company unavailable' USING ERRCODE='42501';
 END IF;

 -- Aggregate only: no request IDs, titles, requester fields, bank data,
 -- notes, vendors, invoice references, or underlying row payloads.
 SELECT coalesce(sum(r.total_amount),0)
 INTO v_requested
 FROM public.frt_requests AS r
 WHERE r.workspace_id=p_workspace_id
  AND r.company_id=v_company_id
  AND r.archived_at IS NULL;

 SELECT coalesce(sum(l.total_spent),0)
 INTO v_spent
 FROM public.frt_liquidations AS l
 JOIN public.frt_requests AS r
  ON r.id=l.fund_request_id
  AND r.workspace_id=l.workspace_id
 WHERE l.workspace_id=p_workspace_id
  AND r.company_id=v_company_id
  AND r.archived_at IS NULL
  AND l.submitted_at IS NOT NULL;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'category',x.category,
   'requested_amount',x.requested_amount::text
  ) ORDER BY x.requested_amount DESC,x.category ASC),'[]'::jsonb)
 INTO v_categories
 FROM (
  SELECT coalesce(nullif(trim(i.category),''),'Uncategorized') AS category,
         sum(i.amount) AS requested_amount
  FROM public.frt_request_items AS i
  JOIN public.frt_requests AS r
   ON r.id=i.fund_request_id
   AND r.workspace_id=i.workspace_id
  WHERE i.workspace_id=p_workspace_id
   AND r.company_id=v_company_id
   AND r.archived_at IS NULL
  GROUP BY coalesce(nullif(trim(i.category),''),'Uncategorized')
  ORDER BY sum(i.amount) DESC,
           coalesce(nullif(trim(i.category),''),'Uncategorized') ASC
  LIMIT 5
 ) AS x;

 -- Six calendar months, including the current database-local month.
 -- Requested is grouped by request creation; spent by liquidation submission.
 v_current_month := date_trunc('month',CURRENT_DATE)::date;
 WITH month_range AS (
  SELECT generate_series(
   v_current_month - interval '5 months',
   v_current_month,
   interval '1 month'
  )::date AS month_start
 ),
 requested AS (
  SELECT date_trunc('month',r.created_at)::date AS month_start,
         sum(r.total_amount) AS amount
  FROM public.frt_requests AS r
  WHERE r.workspace_id=p_workspace_id
   AND r.company_id=v_company_id
   AND r.archived_at IS NULL
   AND r.created_at >= (v_current_month - interval '5 months')
   AND r.created_at < (v_current_month + interval '1 month')
  GROUP BY date_trunc('month',r.created_at)::date
 ),
 spent AS (
  SELECT date_trunc('month',l.submitted_at)::date AS month_start,
         sum(l.total_spent) AS amount
  FROM public.frt_liquidations AS l
  JOIN public.frt_requests AS r
   ON r.id=l.fund_request_id
   AND r.workspace_id=l.workspace_id
  WHERE l.workspace_id=p_workspace_id
   AND r.company_id=v_company_id
   AND r.archived_at IS NULL
   AND l.submitted_at IS NOT NULL
   AND l.submitted_at >= (v_current_month - interval '5 months')
   AND l.submitted_at < (v_current_month + interval '1 month')
  GROUP BY date_trunc('month',l.submitted_at)::date
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'month',to_char(m.month_start,'YYYY-MM'),
   'requested_amount',coalesce(q.amount,0)::text,
   'spent_amount',coalesce(s.amount,0)::text
  ) ORDER BY m.month_start),'[]'::jsonb)
 INTO v_months
 FROM month_range AS m
 LEFT JOIN requested AS q ON q.month_start=m.month_start
 LEFT JOIN spent AS s ON s.month_start=m.month_start;

 RETURN jsonb_build_object(
  'company_code',p_company,
  'requested_total',v_requested::text,
  'spent_total',v_spent::text,
  'top_categories',v_categories,
  'monthly_trend',v_months
 );
END;
$fn$;

-- Only signed authenticated callers may invoke the RPC. The existing
-- private.frt_current_role check remains authoritative inside the function.
REVOKE ALL ON FUNCTION public.frt_board_financial_analytics_safe(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_board_financial_analytics_safe(uuid,text)
 TO authenticated;

COMMIT;
