-- CP-FRT-SEC14 Production Activation: ADDITIVE restricted read RPCs only.
-- Does NOT revoke pre-existing FRT RPC privileges or alter users or finance data.
-- Legacy cutover remains separately gated on consumer compatibility and signed evidence.
-- Canonical restricted detail body and safe list/dashboard bodies are source-aligned.
BEGIN;
DO $g$
BEGIN
 IF to_regprocedure('private.frt_current_role(uuid)') IS NULL
    OR to_regprocedure('public.frt_get_request(uuid,uuid)') IS NULL
    OR to_regprocedure('public.frt_list_requests(uuid,text,text)') IS NULL
    OR to_regprocedure('public.frt_dashboard(uuid,text)') IS NULL
    OR to_regprocedure('public.frt_request_action(uuid,uuid,text,jsonb)') IS NULL
    OR to_regclass('public.frt_requests') IS NULL
    OR to_regclass('public.frt_companies') IS NULL
    OR to_regprocedure('public.frt_restricted_request_detail(uuid,uuid)') IS NOT NULL
    OR to_regprocedure('public.frt_board_list_safe(uuid,text,text)') IS NOT NULL
    OR to_regprocedure('public.frt_board_dashboard_safe(uuid,text)') IS NOT NULL
 THEN
  RAISE EXCEPTION 'SEC14 additive activation requires exact legacy baseline and no installed candidates' USING ERRCODE='55000';
 END IF;
END;
$g$;

CREATE OR REPLACE FUNCTION public.frt_restricted_request_detail(
 p_workspace_id uuid,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE r record; v_role text; v_actions jsonb;
BEGIN
 v_role:=private.frt_current_role(p_workspace_id);
 IF v_role IS NULL OR auth.uid() IS NULL THEN
   RAISE EXCEPTION 'FRT access denied' USING errcode='42501';
 END IF;
 SELECT fr.id,fr.workspace_id,fc.code company_code,
 fr.voucher_no,fr.title,fr.status,fr.liquidation_status,
 to_char(fr.date_needed,'YYYY-MM-DD') date_needed,
 fr.finance_approved_at,fr.transfer_confirmed_at,fr.closed_at,fr.archived_at
 INTO r FROM public.frt_requests fr
 JOIN public.frt_companies fc ON fc.id=fr.company_id
 AND fc.workspace_id=fr.workspace_id
 WHERE fr.workspace_id=p_workspace_id AND fr.id=p_request_id
 AND fr.archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING errcode='42501'; END IF;
 v_actions:=(
 SELECT jsonb_agg(jsonb_build_object(
   'code',a.code,'eligible',a.eligible,
   'authority','SERVER_ROLE_AND_LIFECYCLE_PREVIEW_ONLY'
 ) ORDER BY a.ord)
 FROM (VALUES
 (1,'approve',(v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER') AND r.status='PENDING_APPROVAL')),
 (2,'approve/revoke',(v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER') AND r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED') AND r.liquidation_status='NOT_SUBMITTED')),
 (3,'reject',(v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER') AND r.status='PENDING_APPROVAL')),
 (4,'transfer',(v_role='GENERAL_MANAGER' AND r.finance_approved_at IS NOT NULL AND r.transfer_confirmed_at IS NULL AND r.status NOT IN ('CLOSED','REJECTED'))),
 (5,'transfer/revoke',(v_role='GENERAL_MANAGER' AND r.transfer_confirmed_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED'))),
 (6,'close',(v_role IN ('FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER') AND r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED') AND r.liquidation_status='APPROVED')),
 (7,'archive',(v_role='GENERAL_MANAGER' AND r.archived_at IS NULL)),
 (8,'liquidation/approve',(v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER') AND r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED') AND r.liquidation_status='SUBMITTED'))
 ) AS a(ord,code,eligible)
 );
 RETURN jsonb_build_object(
  'id',r.id,'workspace_id',r.workspace_id,'company_code',r.company_code,
  'voucher_no',r.voucher_no,'title',r.title,'status',r.status,
  'liquidation_status',r.liquidation_status,'date_needed',r.date_needed,
  'finance_approved_at',r.finance_approved_at,
  'transfer_confirmed_at',r.transfer_confirmed_at,
  'closed_at',r.closed_at,'archived_at',r.archived_at,
  'workflow',v_actions
 );
END $fn$;

-- New endpoint execution is authenticated only; preserve every legacy grant.
REVOKE ALL ON FUNCTION public.frt_restricted_request_detail(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_restricted_request_detail(uuid,uuid)
 TO authenticated;

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
