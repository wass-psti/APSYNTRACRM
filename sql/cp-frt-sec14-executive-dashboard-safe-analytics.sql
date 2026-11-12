-- CP-FRT Executive Dashboard: additive aggregate-only reporting RPC.
-- Candidate migration: do not apply to production until the new authenticated
-- EXECUTE grant is separately approved. Existing roles, policies and grants
-- are not modified. No request-level, recipient, banking or user data returned.
BEGIN;

DO $preflight$
BEGIN
 IF to_regprocedure('private.frt_current_role(uuid)') IS NULL
    OR to_regclass('public.frt_requests') IS NULL
    OR to_regclass('public.frt_companies') IS NULL
    OR to_regclass('public.frt_request_items') IS NULL
    OR to_regclass('public.frt_liquidations') IS NULL
    OR to_regprocedure('public.frt_executive_dashboard_safe(uuid,text)') IS NOT NULL
 THEN
  RAISE EXCEPTION 'FRT executive analytics require the canonical FRT schema and an unused RPC name'
   USING ERRCODE='55000';
 END IF;
END;
$preflight$;

CREATE FUNCTION public.frt_executive_dashboard_safe(
 p_workspace_id uuid,p_company text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_result jsonb;
 v_start timestamptz := date_trunc('month',current_date)::timestamptz - interval '6 months';
 v_end timestamptz := date_trunc('month',current_date)::timestamptz;
BEGIN
 IF auth.uid() IS NULL OR private.frt_current_role(p_workspace_id) IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' THEN
  RAISE EXCEPTION 'Invalid FRT company' USING ERRCODE='22023';
 END IF;

 WITH scoped_requests AS (
  SELECT r.id,r.workspace_id,r.total_amount,r.status,r.finance_approved_at,
         r.liquidation_status,r.created_at
  FROM public.frt_requests r
  JOIN public.frt_companies c ON c.id=r.company_id
   AND c.workspace_id=r.workspace_id
  WHERE r.workspace_id=p_workspace_id AND c.code=p_company
   AND r.archived_at IS NULL
 ), totals AS (
  SELECT
   round(coalesce(sum(r.total_amount),0),2) AS total_amount,
   round(coalesce(sum(r.total_amount) FILTER
    (WHERE r.status IN ('DONE','CLOSED')),0),2) AS total_liquidated,
   round(coalesce(sum(r.total_amount) FILTER
    (WHERE r.finance_approved_at IS NOT NULL
     AND r.status NOT IN ('CLOSED','REJECTED')
     AND r.liquidation_status<>'APPROVED'),0),2) AS pending_liquidation
  FROM scoped_requests r
 ), category_rows AS (
  SELECT left(coalesce(nullif(btrim(i.category),''),'Uncategorized'),80) AS category,
         round(sum(i.amount),2) AS amount
  FROM public.frt_request_items i
  JOIN scoped_requests r ON r.id=i.fund_request_id
   AND r.workspace_id=i.workspace_id
  GROUP BY left(coalesce(nullif(btrim(i.category),''),'Uncategorized'),80)
  ORDER BY sum(i.amount) DESC,category ASC
  LIMIT 5
 ), months AS (
  SELECT generate_series(v_start::date,(v_end - interval '1 month')::date,
   interval '1 month')::date AS month_start
 ), requested_monthly AS (
  SELECT date_trunc('month',r.created_at)::date AS month_start,
         round(sum(r.total_amount),2) AS amount
  FROM scoped_requests r
  WHERE r.created_at>=v_start AND r.created_at<v_end
  GROUP BY date_trunc('month',r.created_at)::date
 ), spent_monthly AS (
  SELECT date_trunc('month',l.submitted_at)::date AS month_start,
         round(sum(l.total_spent),2) AS amount
  FROM public.frt_liquidations l
  JOIN scoped_requests r ON r.id=l.fund_request_id
   AND r.workspace_id=l.workspace_id
  WHERE l.workspace_id=p_workspace_id
   AND l.submitted_at IS NOT NULL
   AND l.submitted_at>=v_start AND l.submitted_at<v_end
  GROUP BY date_trunc('month',l.submitted_at)::date
 )
 SELECT jsonb_build_object(
  'total_amount',t.total_amount,
  'total_liquidated',t.total_liquidated,
  'budget_utilization',CASE WHEN t.total_amount>0
   THEN round(t.total_liquidated/t.total_amount*100,2) ELSE 0 END,
  'pending_liquidation',t.pending_liquidation,
  'top_categories',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'category',c.category,'amount',c.amount)
   ORDER BY c.amount DESC,c.category ASC),'[]'::jsonb) FROM category_rows c),
  'monthly_trend',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'period',to_char(m.month_start,'YYYY-MM'),
   'requested',coalesce(r.amount,0),
   'spent',coalesce(s.amount,0))
   ORDER BY m.month_start),'[]'::jsonb)
   FROM months m
   LEFT JOIN requested_monthly r ON r.month_start=m.month_start
   LEFT JOIN spent_monthly s ON s.month_start=m.month_start)
 ) INTO v_result FROM totals t;

 RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.frt_executive_dashboard_safe(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_executive_dashboard_safe(uuid,text)
 TO authenticated;

COMMIT;
