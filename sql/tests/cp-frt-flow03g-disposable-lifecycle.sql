-- CP-FRT-FLOW-03G: rollback-only end-to-end FRT lifecycle acceptance.
-- Exercises the existing request, finance, GM, bank evidence and liquidation contracts.
-- All records and generated voucher counters are rolled back.
BEGIN;
DO $test$
DECLARE
 v_workspace uuid;
 v_company uuid;
 v_requestor uuid;
 v_finance uuid;
 v_gm uuid;
 v_request jsonb;
 v_request_id uuid;
 v_voucher text;
 v_action jsonb;
 v_audit_action text;
 v_bank jsonb;
 v_bank_snapshot jsonb;
 v_liquidation jsonb;
 v_liquidation_snapshot jsonb;
 v_execution_at timestamptz;
 v_count integer;
 v_row public.frt_requests%ROWTYPE;
 v_liquidation_row public.frt_liquidations%ROWTYPE;
BEGIN
 SELECT id INTO STRICT v_workspace FROM public.workspaces ORDER BY id LIMIT 1;
 SELECT id INTO STRICT v_company FROM public.frt_companies
  WHERE workspace_id=v_workspace AND code='WASS';
 SELECT id INTO STRICT v_requestor FROM auth.users
  WHERE id='00000000-0000-4000-8000-000000000002';
 SELECT id INTO STRICT v_finance FROM auth.users
  WHERE id='00000000-0000-4000-8000-000000000003';
 SELECT id INTO STRICT v_gm FROM auth.users
  WHERE id='00000000-0000-4000-8000-000000000004';

 INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status)
 VALUES
  (v_workspace,v_requestor,'REQUESTOR',true,'active'),
  (v_workspace,v_finance,'FINANCE_APPROVER',true,'active'),
  (v_workspace,v_gm,'GENERAL_MANAGER',true,'active')
 ON CONFLICT(workspace_id,user_id) DO UPDATE
 SET role=EXCLUDED.role,enabled=true,status='active';

 -- Production-shaped request in the disposable database, through the same
 -- monthly-numbering create RPC used by the signed application. Never production.
 PERFORM set_config('request.jwt.claim.sub',v_requestor::text,true);
 v_request:=public.frt_create_request(v_workspace,jsonb_build_object(
  'company','WASS',
  'title','CP-FRT-FLOW-03G disposable lifecycle',
  'department','Operations',
  'fundSource','WASS Operating Account',
  'requestDate',CURRENT_DATE::text,
  'dateNeeded',(CURRENT_DATE+7)::text,
  'description','Rollback-only lifecycle acceptance across existing FRT contracts.',
  'recipientName','Disposable Lifecycle Supplier',
  'recipientBank','Disposable Bank',
  'recipientAccount','DISPOSABLE-ACCOUNT-ONLY',
  'orderIntakeNo','CP-FRT-FLOW-03G-DISPOSABLE',
  'items',jsonb_build_array(
   jsonb_build_object('category','Materials','amount','100.25','notes','Disposable test item'),
   jsonb_build_object('category','Delivery','amount','50.25','notes','Disposable test item')
  )
 ));
 v_request_id:=(v_request->>'id')::uuid;
 v_voucher:=v_request->>'voucher_no';
 IF v_request_id IS NULL OR
    v_voucher<>format('DV-WASS-%s-001',to_char(CURRENT_DATE,'YYYYMM')) OR
    v_request->>'company_id'<>v_company::text OR
    (v_request->>'total_amount')::numeric<>150.50 THEN
  RAISE EXCEPTION 'Request creation/total readback mismatch: %',v_request;
 END IF;
 SELECT count(*) INTO v_count FROM public.frt_request_items
 WHERE workspace_id=v_workspace AND fund_request_id=v_request_id;
 IF v_count<>2 THEN RAISE EXCEPTION 'Expected 2 persisted expense items, found %',v_count; END IF;

 -- Finance approval is a separate recorded domain action.
 PERFORM set_config('request.jwt.claim.sub',v_finance::text,true);
 v_action:=public.frt_request_action(v_workspace,v_request_id,'approve','{}'::jsonb);
 IF v_action->>'ok'<>'true' THEN RAISE EXCEPTION 'Finance approval was not acknowledged: %',v_action; END IF;

 -- General Manager verification is a separate recorded domain action.
 PERFORM set_config('request.jwt.claim.sub',v_gm::text,true);
 v_action:=public.frt_request_action(v_workspace,v_request_id,'transfer',
  jsonb_build_object('reference','CP-FRT-FLOW-03G-DISPOSABLE-GM'));
 IF v_action->>'ok'<>'true' THEN RAISE EXCEPTION 'GM verification was not acknowledged: %',v_action; END IF;

 -- Bank execution is explicitly staff-recorded evidence, not a bank API transfer.
 v_execution_at:=clock_timestamp();
 v_bank:=public.frt_record_bank_execution(v_workspace,v_request_id,jsonb_build_object(
  'bankName','Disposable Bank',
  'transactionReference','CP-FRT-FLOW-03G-DISPOSABLE-BANK',
  'executedAt',v_execution_at
 ));
 IF v_bank->>'ok'<>'true' OR v_bank->>'replayed'<>'false' THEN
  RAISE EXCEPTION 'Bank evidence was not newly recorded: %',v_bank;
 END IF;
 v_bank_snapshot:=public.frt_bank_execution_snapshot(v_workspace,v_request_id);
 IF v_bank_snapshot->>'recorded'<>'true' OR
    v_bank_snapshot->>'source'<>'STAFF_RECORDED_BANK_EVIDENCE' OR
    (v_bank_snapshot->>'deadlineAt')::timestamptz<>v_execution_at+interval '3 days' THEN
  RAISE EXCEPTION 'Bank execution snapshot/deadline readback mismatch: %',v_bank_snapshot;
 END IF;

 -- Requestor submits actual-shaped receipt data; exact amount reconciles.
 PERFORM set_config('request.jwt.claim.sub',v_requestor::text,true);
 v_liquidation_snapshot:=public.frt_liquidation_snapshot(v_workspace,v_request_id);
 IF v_liquidation_snapshot->>'revision' IS NOT NULL OR
    v_liquidation_snapshot->>'eligible'<>'true' THEN
  RAISE EXCEPTION 'Initial liquidation snapshot is not eligible: %',v_liquidation_snapshot;
 END IF;
 v_liquidation:=public.frt_submit_liquidation_v2(v_workspace,v_request_id,jsonb_build_object(
  'items',jsonb_build_array(
   jsonb_build_object('description','Materials purchase','vendor','Disposable Supplier',
    'orInvoiceNo','DISPOSABLE-OR-001','receiptDate',CURRENT_DATE::text,'amount','100.25'),
   jsonb_build_object('description','Delivery charge','vendor','Disposable Courier',
    'orInvoiceNo','DISPOSABLE-OR-002','receiptDate',CURRENT_DATE::text,'amount','50.25')
  ),
  'notes','Rollback-only CP-FRT-FLOW-03G lifecycle acceptance',
  'submissionKey',gen_random_uuid()
 ));
 IF v_liquidation->>'ok'<>'true' OR v_liquidation->>'spentAmount'<>'150.50' THEN
  RAISE EXCEPTION 'Liquidation submission did not reconcile: %',v_liquidation;
 END IF;
 v_liquidation_snapshot:=public.frt_liquidation_snapshot(v_workspace,v_request_id);
 IF v_liquidation_snapshot->>'liquidationStatus'<>'SUBMITTED' OR
    v_liquidation_snapshot->>'reconciliationState'<>'BALANCED' OR
    v_liquidation_snapshot->>'spentAmount'<>'150.50' OR
    jsonb_array_length(v_liquidation_snapshot->'items')<>2 THEN
  RAISE EXCEPTION 'Liquidation readback mismatch: %',v_liquidation_snapshot;
 END IF;

 -- Finance review and close are distinct persisted actions.
 PERFORM set_config('request.jwt.claim.sub',v_finance::text,true);
 v_action:=public.frt_request_action(v_workspace,v_request_id,'liquidation/approve','{}'::jsonb);
 IF v_action->>'ok'<>'true' THEN RAISE EXCEPTION 'Liquidation approval failed: %',v_action; END IF;
 v_action:=public.frt_request_action(v_workspace,v_request_id,'close','{}'::jsonb);
 IF v_action->>'ok'<>'true' THEN RAISE EXCEPTION 'Final request close failed: %',v_action; END IF;

 SELECT * INTO STRICT v_row FROM public.frt_requests
 WHERE workspace_id=v_workspace AND id=v_request_id;
 SELECT * INTO STRICT v_liquidation_row FROM public.frt_liquidations
 WHERE workspace_id=v_workspace AND fund_request_id=v_request_id;
 IF v_row.voucher_no<>v_voucher OR v_row.status<>'CLOSED' OR
    v_row.finance_approved_by<>v_finance OR v_row.transfer_confirmed_by<>v_gm OR
    v_row.transfer_reference<>'CP-FRT-FLOW-03G-DISPOSABLE-GM' OR
    v_row.liquidation_status<>'APPROVED' OR v_row.closed_by<>v_finance OR
    v_row.closed_at IS NULL THEN
  RAISE EXCEPTION 'Final request lifecycle state or voucher identity mismatch: %',row_to_json(v_row);
 END IF;
 IF v_liquidation_row.total_spent<>150.50 OR
    v_liquidation_row.excess_or_deficit<>0 OR
    v_liquidation_row.reviewed_by<>v_finance OR
    v_liquidation_row.reviewed_at IS NULL THEN
  RAISE EXCEPTION 'Liquidation approval readback mismatch: %',row_to_json(v_liquidation_row);
 END IF;
 IF (SELECT count(*) FROM public.frt_bank_executions
     WHERE workspace_id=v_workspace AND fund_request_id=v_request_id)<>1 THEN
  RAISE EXCEPTION 'Expected exactly one bank evidence row.';
 END IF;
 FOREACH v_audit_action IN ARRAY ARRAY[
  'REQUEST_CREATED','FINANCE_APPROVED','GM_VERIFIED','BANK_EXECUTION_RECORDED',
  'LIQUIDATION_SUBMITTED','LIQUIDATION_APPROVED','REQUEST_CLOSED'
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM public.frt_audit_logs
   WHERE workspace_id=v_workspace AND fund_request_id=v_request_id
    AND action=v_audit_action) THEN
   RAISE EXCEPTION 'Missing lifecycle audit event: %',v_audit_action;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.frt_audit_logs
     WHERE workspace_id=v_workspace AND fund_request_id=v_request_id
      AND action IN ('REQUEST_CREATED','FINANCE_APPROVED','GM_VERIFIED',
       'BANK_EXECUTION_RECORDED','LIQUIDATION_SUBMITTED','LIQUIDATION_APPROVED',
       'REQUEST_CLOSED'))<>7 THEN
  RAISE EXCEPTION 'Lifecycle audit events are duplicated or missing.';
 END IF;

 RAISE NOTICE 'CP-FRT-FLOW-03G PASS: request %, DV %, 2 expense items, Finance approval, GM verification, bank evidence, 2 receipt liquidation items, liquidation approval, close and 7 audit events',
  v_request_id,v_voucher;
END
$test$;
ROLLBACK;
