-- CP-FRT-EXEC-02: extend the EXISTING signed company-scoped dashboard projection.
-- No new RPC, function grant, table grant, role, RLS change, or data write.
-- Existing authenticated EXECUTE privileges and FRT membership checks are preserved.
BEGIN;

DO $preflight$
BEGIN
 IF to_regprocedure('private.frt_current_role(uuid)') IS NULL OR
    to_regprocedure('public.frt_board_dashboard_safe(uuid,text)') IS NULL OR
    to_regclass('public.frt_companies') IS NULL OR
    to_regclass('public.frt_requests') IS NULL OR
    to_regclass('public.frt_request_items') IS NULL OR
    to_regclass('public.frt_liquidations') IS NULL THEN
  RAISE EXCEPTION 'CP-FRT-EXEC-02 authoritative FRT dependencies absent'
   USING ERRCODE='55000';
 END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.frt_board_dashboard_safe(
 p_workspace_id uuid,p_company text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
 v_role text;
 v_company_id uuid;
 v_summary jsonb;
 v_requested numeric;
 v_spent numeric;
 v_categories jsonb;
 v_months jsonb;
 v_current_month date;
BEGIN
 -- Preserve the existing signed FRT session and workspace membership guard.
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

 SELECT c.id INTO v_company_id
 FROM public.frt_companies AS c
 WHERE c.workspace_id=p_workspace_id AND c.code=p_company;
 -- An unknown company retains the existing safe dashboard's zero-result behavior.

 -- Existing nonmonetary workflow metrics.
 SELECT jsonb_build_object(
  'total_requests',count(*)::integer,
  'pending',(count(*) FILTER (WHERE r.status='PENDING_APPROVAL'))::integer,
  'in_progress',(count(*) FILTER (WHERE r.finance_approved_at IS NOT NULL
    AND r.status NOT IN ('CLOSED','REJECTED')))::integer,
  'completed',(count(*) FILTER (WHERE r.status IN ('DONE','CLOSED')))::integer,
  'pending_liquidation_count',(count(*) FILTER
    (WHERE r.finance_approved_at IS NOT NULL
     AND r.status NOT IN ('CLOSED','REJECTED')
     AND r.liquidation_status<>'APPROVED'))::integer
 ) INTO v_summary
 FROM public.frt_requests AS r
 WHERE r.workspace_id=p_workspace_id
  AND r.company_id=v_company_id
  AND r.archived_at IS NULL;

 -- Company-wide requested total. Individual request amounts never leave SQL.
 SELECT coalesce(sum(r.total_amount),0)
 INTO v_requested
 FROM public.frt_requests AS r
 WHERE r.workspace_id=p_workspace_id
  AND r.company_id=v_company_id
  AND r.archived_at IS NULL;

 -- Actual submitted liquidation totals; unsubmitted drafts are excluded.
 SELECT coalesce(sum(l.total_spent),0)
 INTO v_spent
 FROM public.frt_liquidations AS l
 JOIN public.frt_requests AS r
  ON r.id=l.fund_request_id AND r.workspace_id=l.workspace_id
 WHERE l.workspace_id=p_workspace_id
  AND r.company_id=v_company_id
  AND r.archived_at IS NULL
  AND l.submitted_at IS NOT NULL;

 -- Top five requested expense categories from request line items.
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
   ON r.id=i.fund_request_id AND r.workspace_id=i.workspace_id
  WHERE i.workspace_id=p_workspace_id
   AND r.company_id=v_company_id
   AND r.archived_at IS NULL
  GROUP BY coalesce(nullif(trim(i.category),''),'Uncategorized')
  ORDER BY sum(i.amount) DESC,
           coalesce(nullif(trim(i.category),''),'Uncategorized') ASC
  LIMIT 5
 ) AS x;

 -- Six database-local calendar months, including the current month.
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
   ON r.id=l.fund_request_id AND r.workspace_id=l.workspace_id
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

 -- Return the original five counts plus aggregate-only analytics.
 RETURN v_summary || jsonb_build_object(
  'company_code',p_company,
  'requested_total',v_requested::text,
  'spent_total',v_spent::text,
  'top_categories',v_categories,
  'monthly_trend',v_months
 );
END;
$fn$;

-- Intentionally no GRANT/REVOKE statements: CREATE OR REPLACE preserves the
-- existing function owner and ACL. No table or role privileges are modified.

COMMIT;
