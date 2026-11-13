-- CP-FRT-WF-04: read-only, signed company-wide liquidation aging.
-- Existing FRT role resolver, memberships, lifecycle writers and RLS are unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.frt_liquidation_aging_company(
 p_workspace_id uuid,p_company text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE v_role text; v_company_id uuid; v_out jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FRT access denied' USING errcode='42501'; END IF;
 v_role:=private.frt_current_role(p_workspace_id);
 IF v_role IS NULL THEN RAISE EXCEPTION 'FRT access denied' USING errcode='42501'; END IF;
 IF p_company IS NULL OR p_company !~ '^[A-Za-z0-9_-]{1,32}$' THEN
  RAISE EXCEPTION 'Invalid FRT company' USING errcode='22023';
 END IF;
 SELECT id INTO v_company_id FROM public.frt_companies
 WHERE workspace_id=p_workspace_id AND code=p_company;

 SELECT jsonb_build_object(
  'company_code',p_company,
  'pending_total',(count(*) FILTER(WHERE r.liquidation_status<>'APPROVED'))::integer,
  'awaiting_bank_execution',(count(*) FILTER(WHERE r.liquidation_status<>'APPROVED' AND b.executed_at IS NULL))::integer,
  'on_track',(count(*) FILTER(WHERE r.liquidation_status<>'APPROVED'
    AND b.executed_at IS NOT NULL AND b.executed_at+interval '3 days'>now()+interval '24 hours'))::integer,
  'due_soon',(count(*) FILTER(WHERE r.liquidation_status<>'APPROVED'
    AND b.executed_at IS NOT NULL AND b.executed_at+interval '3 days'>=now()
    AND b.executed_at+interval '3 days'<=now()+interval '24 hours'))::integer,
  'overdue',(count(*) FILTER(WHERE r.liquidation_status<>'APPROVED'
    AND b.executed_at IS NOT NULL AND b.executed_at+interval '3 days'<now()))::integer,
  'completed',(count(*) FILTER(WHERE r.liquidation_status='APPROVED'
    AND b.executed_at IS NOT NULL))::integer,
  'source','STAFF_RECORDED_BANK_EVIDENCE',
  'deadline_hours',72
 ) INTO v_out
 FROM public.frt_requests r
 LEFT JOIN public.frt_bank_executions b
  ON b.fund_request_id=r.id AND b.workspace_id=r.workspace_id
 WHERE r.workspace_id=p_workspace_id AND r.company_id=v_company_id
   AND r.finance_approved_at IS NOT NULL
   AND r.archived_at IS NULL AND r.status<>'REJECTED'
   AND (r.status<>'CLOSED' OR r.liquidation_status='APPROVED');
 RETURN v_out;
END $fn$;
REVOKE ALL ON FUNCTION public.frt_liquidation_aging_company(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_liquidation_aging_company(uuid,text) TO authenticated;
COMMIT;
