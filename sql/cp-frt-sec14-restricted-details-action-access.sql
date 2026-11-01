-- CP-FRT-SEC14. Controlled deployment migration. Do not execute without
-- consumer compatibility, signed-session and rollback acceptance.
-- The only data-facing change is a restricted, server-side detail projection.
-- The action permission preview is an authenticated read, never an action.
BEGIN;
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
REVOKE ALL ON FUNCTION public.frt_restricted_request_detail(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.frt_restricted_request_detail(uuid,uuid) TO authenticated;
-- Critical: revoke the legacy broad authenticated entry point in this SAME
-- transaction after the new entry point has passed isolated acceptance.
REVOKE EXECUTE ON FUNCTION public.frt_get_request(uuid,uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
