-- CP-FRT-FLOW-03K: one-field audited compare-and-swap correction.
-- Existing finance correction roles only. No voucher reallocation or accounting mutation.
CREATE OR REPLACE FUNCTION public.frt_correct_request_payee_cas(
 p_workspace_id uuid, p_request_id uuid, p_expected_payee text, p_next_payee text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $payee$
DECLARE
 v_request public.frt_requests%ROWTYPE;
 v_name text:=btrim(p_next_payee);
BEGIN
 IF auth.uid() IS NULL OR NOT private.frt_has_role(p_workspace_id,
  'FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER') THEN
  RAISE EXCEPTION 'FRT_PAYEE_ROLE_DENIED' USING ERRCODE='42501';
 END IF;
 IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 180 OR
  lower(v_name) IN ('none','n/a','na','unknown','not recorded') THEN
  RAISE EXCEPTION 'FRT_PAYEE_INVALID' USING ERRCODE='22023';
 END IF;
 -- The row-level CAS both serializes concurrent corrections and protects
 -- later Finance/GM, accounting, banking, liquidation and closed states.
 UPDATE public.frt_requests r
 SET recipient_name=v_name, updated_at=clock_timestamp()
 WHERE r.workspace_id=p_workspace_id AND r.id=p_request_id
  AND r.archived_at IS NULL
  AND r.status='PENDING_APPROVAL' AND r.finance_approved_at IS NULL
  AND r.transfer_confirmed_at IS NULL AND r.closed_at IS NULL
  AND r.liquidation_status='NOT_SUBMITTED'
  AND r.recipient_name IS NOT DISTINCT FROM p_expected_payee
  AND r.recipient_name IS DISTINCT FROM v_name
  AND NOT EXISTS (SELECT 1 FROM public.frt_request_accounting_lines a
   WHERE a.workspace_id=r.workspace_id AND a.fund_request_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.frt_bank_executions b
   WHERE b.workspace_id=r.workspace_id AND b.fund_request_id=r.id)
  AND NOT EXISTS (SELECT 1 FROM public.frt_liquidations l
   WHERE l.workspace_id=r.workspace_id AND l.fund_request_id=r.id)
 RETURNING * INTO v_request;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'FRT_PAYEE_STALE_OR_UNAVAILABLE' USING ERRCODE='40001';
 END IF;
 INSERT INTO public.frt_audit_logs
  (workspace_id,fund_request_id,user_id,action,details)
 VALUES (p_workspace_id,p_request_id,auth.uid(),'REQUEST_PAYEE_CORRECTED',
  jsonb_build_object('from',p_expected_payee,'to',v_name,
   'voucher',v_request.voucher_no));
 RETURN jsonb_build_object('ok',true,'requestId',v_request.id,
  'voucherNumber',v_request.voucher_no,'payee',v_name);
END $payee$;
REVOKE ALL ON FUNCTION public.frt_correct_request_payee_cas(uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_correct_request_payee_cas(uuid,uuid,text,text)
 TO authenticated;
