-- CP-FRT-BOARD-03 candidate: DISPOSABLE CI ONLY until separately approved.
-- Does not modify existing frt_update_request; no new roles or RLS policy.
-- Atomic compare-and-swap on the date with signed finance-correction role.
CREATE OR REPLACE FUNCTION public.frt_update_request_date_cas(
 p_workspace_id uuid,p_request_id uuid,p_expected_date date,p_next_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $cas$
DECLARE v_record public.frt_requests%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT private.frt_has_role(p_workspace_id,
    'FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER') THEN
  RAISE EXCEPTION 'FRT_DATE_ROLE_DENIED' USING ERRCODE='42501';
 END IF;
 IF p_next_date IS NULL THEN
  RAISE EXCEPTION 'FRT_DATE_REQUIRED' USING ERRCODE='22023';
 END IF;
 UPDATE public.frt_requests
 SET date_needed=p_next_date,updated_at=clock_timestamp()
 WHERE workspace_id=p_workspace_id AND id=p_request_id
   AND archived_at IS NULL
   AND date_needed IS NOT DISTINCT FROM p_expected_date
 RETURNING * INTO v_record;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'FRT_DATE_STALE_OR_UNAVAILABLE' USING ERRCODE='40001';
 END IF;
 INSERT INTO public.frt_audit_logs
  (workspace_id,fund_request_id,user_id,action,details)
 VALUES(p_workspace_id,p_request_id,auth.uid(),'REQUEST_DATE_CORRECTED',
  jsonb_build_object('from',p_expected_date,'to',p_next_date));
 RETURN jsonb_build_object('ok',true,'dateNeeded',to_char(v_record.date_needed,'YYYY-MM-DD'));
END $cas$;
REVOKE ALL ON FUNCTION public.frt_update_request_date_cas(uuid,uuid,date,date)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_update_request_date_cas(uuid,uuid,date,date)
 TO authenticated;
