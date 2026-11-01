-- CP-FRT-SEC14 ADDITIVE CANDIDATE: secure dashboard/list projections only.
-- Complements the canonical frt_restricted_request_detail contract.
-- NOT deployed to production by this repository commit.
BEGIN;

DO $preflight$
BEGIN
 IF to_regprocedure('private.frt_current_role(uuid)') IS NULL OR
    to_regclass('public.frt_requests') IS NULL OR
    to_regclass('public.frt_companies') IS NULL THEN
  RAISE EXCEPTION 'SEC14 authoritative FRT dependencies absent' USING ERRCODE='55000';
 END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.frt_board_list_safe(
 p_workspace_id uuid, p_company text, p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_rows jsonb;
BEGIN
 IF private.frt_current_role(p_workspace_id) IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' OR
    length(coalesce(p_search,''))>120 THEN
  RAISE EXCEPTION 'Invalid FRT list filters' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',q.id,'workspace_id',p_workspace_id,'company_code',p_company,
  'voucher_no',q.voucher_no,'title',q.title,
  'date_needed',q.date_needed,'status',q.status,
  'liquidation_status',q.liquidation_status)
  ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)
 INTO v_rows
 FROM (
  SELECT r.id,r.voucher_no,r.title,to_char(r.date_needed,'YYYY-MM-DD') date_needed,
         r.status,r.liquidation_status,r.created_at
  FROM public.frt_requests AS r
  JOIN public.frt_companies AS c ON c.id=r.company_id
       AND c.workspace_id=r.workspace_id
  WHERE r.workspace_id=p_workspace_id AND c.code=p_company
   AND r.archived_at IS NULL
   AND (coalesce(p_search,'')='' OR r.title ILIKE '%'||p_search||'%'
        OR r.voucher_no ILIKE '%'||p_search||'%')
  ORDER BY r.created_at DESC,r.id DESC LIMIT 100
 ) AS q;
 RETURN v_rows;
END;
$f$;

CREATE OR REPLACE FUNCTION public.frt_board_dashboard_safe(
 p_workspace_id uuid,p_company text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_summary jsonb;
BEGIN
 IF private.frt_current_role(p_workspace_id) IS NULL THEN
  RAISE EXCEPTION 'FRT access denied' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' THEN
  RAISE EXCEPTION 'Invalid FRT company' USING ERRCODE='22023';
 END IF;
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
 JOIN public.frt_companies AS c ON c.id=r.company_id
       AND c.workspace_id=r.workspace_id
 WHERE r.workspace_id=p_workspace_id AND c.code=p_company AND r.archived_at IS NULL;
 RETURN v_summary;
END;
$f$;

REVOKE ALL ON FUNCTION public.frt_board_list_safe(uuid,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_board_dashboard_safe(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_board_list_safe(uuid,text,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_board_dashboard_safe(uuid,text)
 TO authenticated;
COMMIT;
