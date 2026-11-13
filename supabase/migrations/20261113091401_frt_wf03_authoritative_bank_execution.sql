-- CP-FRT-WF-03: staff-recorded bank execution, distinct from GM verification.
-- Additive only. The record is an attestation, not confirmation by a banking API.
BEGIN;
CREATE TABLE IF NOT EXISTS public.frt_bank_executions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 fund_request_id uuid NOT NULL,
 executed_at timestamptz NOT NULL,
 bank_name text NOT NULL,
 transaction_reference text NOT NULL,
 recorded_by uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT frt_bank_execution_request_unique UNIQUE(workspace_id,fund_request_id),
 CONSTRAINT frt_bank_execution_bank_size CHECK(length(bank_name) BETWEEN 1 AND 120),
 CONSTRAINT frt_bank_execution_ref_size CHECK(length(transaction_reference) BETWEEN 1 AND 180)
);
CREATE INDEX IF NOT EXISTS frt_bank_execution_workspace_idx
 ON public.frt_bank_executions(workspace_id,executed_at);
ALTER TABLE public.frt_bank_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.frt_bank_executions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.frt_bank_execution_snapshot(p_workspace_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE v_role text; r public.frt_requests; b public.frt_bank_executions;
BEGIN
 v_role:=private.frt_current_role(p_workspace_id);
 IF auth.uid() IS NULL OR v_role IS NULL THEN RAISE EXCEPTION 'FRT access denied' USING errcode='42501'; END IF;
 SELECT * INTO r FROM public.frt_requests
 WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING errcode='42501'; END IF;
 IF v_role='REQUESTOR' AND r.requestor_id<>auth.uid() THEN
  RAISE EXCEPTION 'Request unavailable' USING errcode='42501';
 END IF;
 SELECT * INTO b FROM public.frt_bank_executions
 WHERE workspace_id=p_workspace_id AND fund_request_id=p_request_id;
 RETURN jsonb_build_object(
  'workspaceId',p_workspace_id,'requestId',p_request_id,
  'financeApproved',r.finance_approved_at IS NOT NULL,
  'gmVerified',r.transfer_confirmed_at IS NOT NULL,
  'eligible',r.finance_approved_at IS NOT NULL AND r.transfer_confirmed_at IS NOT NULL
      AND r.status NOT IN ('CLOSED','REJECTED'),
  'recorded',b.id IS NOT NULL,
  'executedAt',b.executed_at,'bankName',b.bank_name,
  'transactionReference',b.transaction_reference,
  'recordedAt',b.recorded_at,
  'deadlineAt',CASE WHEN b.id IS NULL THEN NULL ELSE b.executed_at+interval '3 days' END,
  'liquidationStatus',r.liquidation_status,
  'overdue',CASE WHEN b.id IS NULL OR r.liquidation_status='APPROVED'
    THEN false ELSE (b.executed_at+interval '3 days')<now() END,
  'source',CASE WHEN b.id IS NULL THEN 'NO_BANK_EXECUTION' ELSE 'STAFF_RECORDED_BANK_EVIDENCE' END
 );
END $fn$;

CREATE OR REPLACE FUNCTION public.frt_record_bank_execution(
 p_workspace_id uuid,p_request_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $fn$
DECLARE v_role text; r public.frt_requests; b public.frt_bank_executions;
 v_executed timestamptz; v_bank text; v_reference text;
BEGIN
 v_role:=private.frt_current_role(p_workspace_id);
 IF auth.uid() IS NULL OR v_role IS NULL OR v_role NOT IN ('FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER') THEN
  RAISE EXCEPTION 'FRT bank recording denied' USING errcode='42501';
 END IF;
 SELECT * INTO r FROM public.frt_requests
 WHERE workspace_id=p_workspace_id AND id=p_request_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable' USING errcode='42501'; END IF;
 IF r.finance_approved_at IS NULL OR r.transfer_confirmed_at IS NULL
    OR r.status IN ('CLOSED','REJECTED') THEN
  RAISE EXCEPTION 'Finance approval and GM verification must precede bank recording' USING errcode='23514';
 END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
   OR length(coalesce(p_payload->>'bankName','')) NOT BETWEEN 1 AND 120
   OR length(coalesce(p_payload->>'transactionReference','')) NOT BETWEEN 1 AND 180
   OR coalesce(p_payload->>'executedAt','') !~
     '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN
  RAISE EXCEPTION 'Bank execution evidence requires bank, reference and timestamp' USING errcode='22023';
 END IF;
 v_bank:=trim(p_payload->>'bankName');
 v_reference:=trim(p_payload->>'transactionReference');
 IF v_bank='' OR v_reference='' THEN RAISE EXCEPTION 'Bank evidence cannot be blank' USING errcode='22023'; END IF;
 v_executed:=(p_payload->>'executedAt')::timestamptz;
 IF v_executed>clock_timestamp()+interval '5 minutes' OR
   v_executed<r.created_at OR v_executed<r.finance_approved_at THEN
  RAISE EXCEPTION 'Bank execution timestamp outside request lifecycle' USING errcode='22023';
 END IF;
 SELECT * INTO b FROM public.frt_bank_executions
 WHERE workspace_id=p_workspace_id AND fund_request_id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF b.executed_at=v_executed AND b.bank_name=v_bank AND
     b.transaction_reference=v_reference THEN
   RETURN jsonb_build_object('ok',true,'replayed',true,'executedAt',b.executed_at,
    'deadlineAt',b.executed_at+interval '3 days');
  END IF;
  RAISE EXCEPTION 'Bank execution already recorded; use an audited correction workflow' USING errcode='23505';
 END IF;
 INSERT INTO public.frt_bank_executions(workspace_id,fund_request_id,executed_at,bank_name,transaction_reference,recorded_by)
 VALUES(p_workspace_id,p_request_id,v_executed,v_bank,v_reference,auth.uid())
 RETURNING * INTO b;
 INSERT INTO public.frt_audit_logs(workspace_id,fund_request_id,user_id,action,details)
 VALUES(p_workspace_id,p_request_id,auth.uid(),'BANK_EXECUTION_RECORDED',
 jsonb_build_object('executedAt',v_executed,'bankName',v_bank,
 'transactionReference',v_reference,'bankSource','STAFF_RECORDED_BANK_EVIDENCE'));
 RETURN jsonb_build_object('ok',true,'replayed',false,'executedAt',b.executed_at,
  'deadlineAt',b.executed_at+interval '3 days');
END $fn$;
REVOKE ALL ON FUNCTION public.frt_bank_execution_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.frt_record_bank_execution(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.frt_bank_execution_snapshot(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.frt_record_bank_execution(uuid,uuid,jsonb) TO authenticated;
COMMIT;
