-- CP-FRT-SEC14: ADDITIVE, CANDIDATE. Disposable CI before any live rollout.
-- Enforce restricted-field redaction BEFORE HTTP serialization.
-- Existing broad FRT RPCs and financial mutations are intentionally unchanged.
-- Production grant or legacy RPC cutover requires separate controlled authorization.
BEGIN;

DO $preflight$
BEGIN
 IF to_regprocedure('private.frt_current_role(uuid)') IS NULL OR
    to_regclass('public.frt_requests') IS NULL OR
    to_regclass('public.frt_companies') IS NULL OR
    to_regprocedure('public.frt_request_action(uuid,uuid,text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'SEC14 FRT authoritative dependencies absent' USING ERRCODE='55000';
 END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.frt_board_list_safe(
 p_workspace_id uuid, p_company text, p_search text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $frt$
DECLARE
 v_role text;
 v_result jsonb;
BEGIN
 v_role := private.frt_current_role(p_workspace_id);
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'FRT membership required' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' OR
    length(coalesce(p_search,'')) > 120 THEN
  RAISE EXCEPTION 'Invalid FRT list filters' USING ERRCODE='22023';
 END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id', x.id,
  'workspace_id',p_workspace_id,
  'company_code',p_company,
  'voucher_no',x.voucher_no,
  'title',x.title,
  'date_needed',x.date_needed,
  'status',x.status,
  'liquidation_status',x.liquidation_status
 ) ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb)
 INTO v_result
 FROM (
  SELECT r.id,r.voucher_no,r.title,to_char(r.date_needed,'YYYY-MM-DD') date_needed,
   r.status,r.liquidation_status,r.created_at
  FROM public.frt_requests AS r
  JOIN public.frt_companies AS c
    ON c.id=r.company_id AND c.workspace_id=r.workspace_id
  WHERE r.workspace_id=p_workspace_id AND c.code=p_company
    AND r.archived_at IS NULL
    AND (coalesce(p_search,'')='' OR r.title ILIKE '%'||p_search||'%'
         OR r.voucher_no ILIKE '%'||p_search||'%')
  ORDER BY r.created_at DESC,r.id DESC
  LIMIT 100
 ) AS x;

 RETURN v_result;
END;
$frt$;

CREATE OR REPLACE FUNCTION public.frt_board_dashboard_safe(
 p_workspace_id uuid,p_company text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $frt$
DECLARE
 v_result jsonb;
BEGIN
 IF private.frt_current_role(p_workspace_id) IS NULL THEN
  RAISE EXCEPTION 'FRT membership required' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}
 p_workspace_id uuid,p_request_id uuid,p_company text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $frt$
DECLARE
 v_role text;
 r public.frt_requests%ROWTYPE;
 v_workflow jsonb;
BEGIN
 v_role := private.frt_current_role(p_workspace_id);
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'FRT membership required' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' THEN
  RAISE EXCEPTION 'Invalid FRT company' USING ERRCODE='22023';
 END IF;
 SELECT f.* INTO r
 FROM public.frt_requests AS f
 JOIN public.frt_companies AS c
   ON c.id=f.company_id AND c.workspace_id=f.workspace_id
 WHERE f.workspace_id=p_workspace_id AND f.id=p_request_id
   AND c.code=p_company AND f.archived_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'FRT request not found' USING ERRCODE='P0002';
 END IF;

 -- Server-derived candidate is NOT an execute authorization. Existing
 -- public.frt_request_action re-checks roles, lifecycle and locks the row.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'code',x.code,'label',x.label,
  'candidate',(x.role_ok AND x.state_ok),
  'authority','NOT_VERIFIED_FOR_EXECUTION'
 ) ORDER BY x.position),'[]'::jsonb)
 INTO v_workflow
 FROM (VALUES
  (1,'approve','Finance approval',
   v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER'),
   r.status='PENDING_APPROVAL'),
  (2,'approve/revoke','Revoke finance approval',
   v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER'),
   r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED')
    AND r.liquidation_status='NOT_SUBMITTED'),
  (3,'reject','Reject request',
   v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER'),
   r.status='PENDING_APPROVAL'),
  (4,'transfer','General Manager verification',
   v_role='GENERAL_MANAGER',
   r.finance_approved_at IS NOT NULL AND r.transfer_confirmed_at IS NULL
    AND r.status NOT IN ('CLOSED','REJECTED')),
  (5,'transfer/revoke','Revoke GM verification',
   v_role='GENERAL_MANAGER',
   r.transfer_confirmed_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED')),
  (6,'close','Close request',
   v_role IN ('FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'),
   r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED')
    AND r.liquidation_status='APPROVED'),
  (7,'archive','Archive request',
   v_role='GENERAL_MANAGER',r.archived_at IS NULL),
  (8,'liquidation/approve','Approve liquidation',
   v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER'),
   r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED')
    AND r.liquidation_status='SUBMITTED')
 ) AS x(position,code,label,role_ok,state_ok);

 -- Explicit allowlist. Never return to_jsonb(r), audit, documents, amounts,
 -- recipient, requester, banking, or liquidation/item payload.
 RETURN jsonb_build_object(
  'id',r.id,
  'workspace_id',r.workspace_id,
  'company_code',p_company,
  'voucher_no',r.voucher_no,
  'title',r.title,
  'date_needed',to_char(r.date_needed,'YYYY-MM-DD'),
  'status',r.status,
  'liquidation_status',r.liquidation_status,
  'finance_approved_at',r.finance_approved_at,
  'transfer_confirmed_at',r.transfer_confirmed_at,
  'closed_at',r.closed_at,
  'archived_at',r.archived_at,
  'workflow',v_workflow
 );
END;
$frt$;

-- Independent read endpoints inherit the existing private session-guarded
-- role resolver. No direct FRT table access, no finance action endpoints.
REVOKE ALL ON FUNCTION public.frt_board_dashboard_safe(uuid,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_board_list_safe(uuid,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_board_detail_safe(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_board_dashboard_safe(uuid,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_board_list_safe(uuid,text,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_board_detail_safe(uuid,uuid,text)
 TO authenticated;

COMMIT;
 THEN
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
 ) INTO v_result
 FROM public.frt_requests AS r
 JOIN public.frt_companies AS c ON c.id=r.company_id AND c.workspace_id=r.workspace_id
 WHERE r.workspace_id=p_workspace_id AND c.code=p_company AND r.archived_at IS NULL;
 RETURN v_result;
END;
$frt$;

CREATE OR REPLACE FUNCTION public.frt_board_detail_safe(
 p_workspace_id uuid,p_request_id uuid,p_company text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $frt$
DECLARE
 v_role text;
 r public.frt_requests%ROWTYPE;
 v_workflow jsonb;
BEGIN
 v_role := private.frt_current_role(p_workspace_id);
 IF v_role IS NULL THEN
  RAISE EXCEPTION 'FRT membership required' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' THEN
  RAISE EXCEPTION 'Invalid FRT company' USING ERRCODE='22023';
 END IF;
 SELECT f.* INTO r
 FROM public.frt_requests AS f
 JOIN public.frt_companies AS c
   ON c.id=f.company_id AND c.workspace_id=f.workspace_id
 WHERE f.workspace_id=p_workspace_id AND f.id=p_request_id
   AND c.code=p_company AND f.archived_at IS NULL;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'FRT request not found' USING ERRCODE='P0002';
 END IF;

 -- Server-derived candidate is NOT an execute authorization. Existing
 -- public.frt_request_action re-checks roles, lifecycle and locks the row.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'code',x.code,'label',x.label,
  'candidate',(x.role_ok AND x.state_ok),
  'authority','NOT_VERIFIED_FOR_EXECUTION'
 ) ORDER BY x.position),'[]'::jsonb)
 INTO v_workflow
 FROM (VALUES
  (1,'approve','Finance approval',
   v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER'),
   r.status='PENDING_APPROVAL'),
  (2,'approve/revoke','Revoke finance approval',
   v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER'),
   r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED')
    AND r.liquidation_status='NOT_SUBMITTED'),
  (3,'reject','Reject request',
   v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER'),
   r.status='PENDING_APPROVAL'),
  (4,'transfer','General Manager verification',
   v_role='GENERAL_MANAGER',
   r.finance_approved_at IS NOT NULL AND r.transfer_confirmed_at IS NULL
    AND r.status NOT IN ('CLOSED','REJECTED')),
  (5,'transfer/revoke','Revoke GM verification',
   v_role='GENERAL_MANAGER',
   r.transfer_confirmed_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED')),
  (6,'close','Close request',
   v_role IN ('FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'),
   r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED')
    AND r.liquidation_status='APPROVED'),
  (7,'archive','Archive request',
   v_role='GENERAL_MANAGER',r.archived_at IS NULL),
  (8,'liquidation/approve','Approve liquidation',
   v_role IN ('FINANCE_APPROVER','GENERAL_MANAGER'),
   r.finance_approved_at IS NOT NULL AND r.status NOT IN ('CLOSED','REJECTED')
    AND r.liquidation_status='SUBMITTED')
 ) AS x(position,code,label,role_ok,state_ok);

 -- Explicit allowlist. Never return to_jsonb(r), audit, documents, amounts,
 -- recipient, requester, banking, or liquidation/item payload.
 RETURN jsonb_build_object(
  'id',r.id,
  'workspace_id',r.workspace_id,
  'company_code',p_company,
  'voucher_no',r.voucher_no,
  'title',r.title,
  'date_needed',to_char(r.date_needed,'YYYY-MM-DD'),
  'status',r.status,
  'liquidation_status',r.liquidation_status,
  'finance_approved_at',r.finance_approved_at,
  'transfer_confirmed_at',r.transfer_confirmed_at,
  'closed_at',r.closed_at,
  'archived_at',r.archived_at,
  'workflow',v_workflow
 );
END;
$frt$;

-- Independent read endpoints inherit the existing private session-guarded
-- role resolver. No direct FRT table access, no finance action endpoints.
REVOKE ALL ON FUNCTION public.frt_board_list_safe(uuid,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_board_detail_safe(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_board_list_safe(uuid,text,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_board_detail_safe(uuid,uuid,text)
 TO authenticated;

COMMIT;
