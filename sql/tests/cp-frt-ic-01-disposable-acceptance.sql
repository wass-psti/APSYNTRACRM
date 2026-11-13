-- CP-FRT-IC-01: disposable PostgreSQL acceptance only.
-- Run after the existing SEC14 FRT fixtures and the CP-FRT-IC-01 migration.
-- All intercompany rows and audit events are rolled back.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.frt_companies(workspace_id,code,name,display_order)
VALUES ('00000000-0000-4000-8000-000000000001','PSTI','Fixture C',3);

-- Disposable REQUESTOR account: may read the existing FRT finance projection,
-- but cannot create or settle finance ledger entries.
INSERT INTO auth.users(id)
VALUES ('00000000-0000-4000-8000-00000000000e');
INSERT INTO public.profiles(id,platform_role,status)
VALUES ('00000000-0000-4000-8000-00000000000e','employee','active');
INSERT INTO public.workspace_members(workspace_id,user_id,active)
VALUES ('00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-00000000000e',true);
INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled)
VALUES ('00000000-0000-4000-8000-00000000000e',
        'fund-released-tracker','REQUESTOR',true);

DO $privileges$
BEGIN
 IF NOT has_function_privilege('authenticated','public.frt_ic_snapshot(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.frt_ic_create_obligation(uuid,jsonb)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.frt_ic_record_settlement(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.frt_ic_snapshot(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.frt_ic_create_obligation(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.frt_ic_record_settlement(uuid,uuid,jsonb)','EXECUTE')
    OR NOT has_function_privilege('authenticated','private.frt_ic_snapshot_impl(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','private.frt_ic_create_obligation_impl(uuid,jsonb)','EXECUTE')
    OR NOT has_function_privilege('authenticated','private.frt_ic_record_settlement_impl(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','private.frt_ic_snapshot_impl(uuid)','EXECUTE')
    OR has_function_privilege('anon','private.frt_ic_create_obligation_impl(uuid,jsonb)','EXECUTE')
    OR has_function_privilege('anon','private.frt_ic_record_settlement_impl(uuid,uuid,jsonb)','EXECUTE')
    OR has_table_privilege('authenticated','public.frt_ic_obligations','SELECT')
    OR has_table_privilege('authenticated','public.frt_ic_settlements','SELECT')
    OR has_table_privilege('authenticated','public.frt_ic_obligations','INSERT')
    OR has_table_privilege('authenticated','public.frt_ic_settlements','INSERT')
 THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 RPC/table privilege boundary incorrect';
 END IF;
 IF (SELECT relrowsecurity FROM pg_class WHERE oid='public.frt_ic_obligations'::regclass) IS DISTINCT FROM true
    OR (SELECT relrowsecurity FROM pg_class WHERE oid='public.frt_ic_settlements'::regclass) IS DISTINCT FROM true
    OR (SELECT prosecdef FROM pg_proc WHERE oid='public.frt_ic_snapshot(uuid)'::regprocedure) IS DISTINCT FROM false
    OR (SELECT prosecdef FROM pg_proc WHERE oid='public.frt_ic_create_obligation(uuid,jsonb)'::regprocedure) IS DISTINCT FROM false
    OR (SELECT prosecdef FROM pg_proc WHERE oid='public.frt_ic_record_settlement(uuid,uuid,jsonb)'::regprocedure) IS DISTINCT FROM false
    OR (SELECT prosecdef FROM pg_proc WHERE oid='private.frt_ic_snapshot_impl(uuid)'::regprocedure) IS DISTINCT FROM true
    OR (SELECT prosecdef FROM pg_proc WHERE oid='private.frt_ic_create_obligation_impl(uuid,jsonb)'::regprocedure) IS DISTINCT FROM true
    OR (SELECT prosecdef FROM pg_proc WHERE oid='private.frt_ic_record_settlement_impl(uuid,uuid,jsonb)'::regprocedure) IS DISTINCT FROM true
 THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 RLS or signed RPC execution contract incorrect';
 END IF;
END;
$privileges$;

SET ROLE authenticated;
DO $acceptance$
DECLARE
 w uuid := '00000000-0000-4000-8000-000000000001';
 foreign_workspace uuid := '00000000-0000-4000-8000-000000000002';
 finance_manager uuid := '00000000-0000-4000-8000-00000000000b';
 general_manager uuid := '00000000-0000-4000-8000-00000000000a';
 requestor uuid := '00000000-0000-4000-8000-00000000000e';
 loan_id uuid;
 receivable_id uuid;
 j jsonb;
 receipt jsonb;
 blocked boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',finance_manager::text,true);
 j:=public.frt_ic_snapshot(w);
 IF j->>'workspace_id'<>w::text OR jsonb_array_length(j->'companies')<>3
    OR jsonb_array_length(j->'receivables_matrix')<>9
    OR jsonb_array_length(j->'payables_matrix')<>9
    OR (j->'summary'->>'total_receivables')::numeric<>0
    OR (j->'summary'->>'total_payables')::numeric<>0
    OR j->'summary'->>'ledger_balanced'<>'true'
    OR j->>'disclosure' NOT LIKE '%not external counterparty confirmation%'
 THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 initial empty ledger contract incorrect: %',j;
 END IF;

 receipt:=public.frt_ic_create_obligation(w,jsonb_build_object(
  'kind','LOAN','reference','IC01-LOAN-001','description','Disposable loan fixture',
  'creditorCode','WAO','debtorCode','WASS','amount','600000.00',
  'issuedOn',(CURRENT_DATE-60)::text,'dueOn',(CURRENT_DATE-10)::text));
 loan_id:=(receipt->>'id')::uuid;
 IF receipt->>'ok'<>'true' OR loan_id IS NULL THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 loan creation receipt invalid: %',receipt;
 END IF;

 receipt:=public.frt_ic_create_obligation(w,jsonb_build_object(
  'kind','RECEIVABLE','reference','IC01-REC-001','description','Disposable receivable fixture',
  'creditorCode','PSTI','debtorCode','WAO','amount','250000.00',
  'issuedOn',(CURRENT_DATE-20)::text,'dueOn',(CURRENT_DATE+45)::text));
 receivable_id:=(receipt->>'id')::uuid;
 IF receipt->>'ok'<>'true' OR receivable_id IS NULL THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 receivable creation receipt invalid: %',receipt;
 END IF;

 j:=public.frt_ic_snapshot(w);
 IF (j->'summary'->>'total_receivables')::numeric<>850000
    OR (j->'summary'->>'total_payables')::numeric<>850000
    OR (j->'summary'->>'active_loan_count')::integer<>1
    OR (j->'summary'->>'active_loan_balance')::numeric<>600000
    OR (j->'summary'->>'overdue_count')::integer<>1
    OR (j->'summary'->>'high_exposure_pair_count')::integer<>1
    OR (SELECT (x->>'amount')::numeric FROM jsonb_array_elements(j->'receivables_matrix') x
        WHERE x->>'row_company_code'='WAO' AND x->>'column_company_code'='WASS')<>600000
    OR (SELECT (x->>'amount')::numeric FROM jsonb_array_elements(j->'payables_matrix') x
        WHERE x->>'row_company_code'='WASS' AND x->>'column_company_code'='WAO')<>600000
    OR (SELECT (x->>'net_position')::numeric FROM jsonb_array_elements(j->'entities') x
        WHERE x->>'company_code'='WAO')<>350000
    OR jsonb_array_length(j->'loans')<>1
    OR j->'loans'->0->>'risk_status'<>'OVERDUE'
    OR j->'loans'->0->>'outstanding_balance'<>'600000.00'
 THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 bilateral matrix or loan analytics incorrect: %',j;
 END IF;

 receipt:=public.frt_ic_record_settlement(w,loan_id,jsonb_build_object(
  'amount','200000.00','settledOn',CURRENT_DATE::text,
  'reference','IC01-SET-001','notes','Disposable partial repayment'));
 IF receipt->>'ok'<>'true' OR receipt->>'remaining_amount'<>'400000.00' THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 partial settlement receipt invalid: %',receipt;
 END IF;
 j:=public.frt_ic_snapshot(w);
 IF (j->'summary'->>'total_receivables')::numeric<>650000
    OR (j->'summary'->>'total_payables')::numeric<>650000
    OR (j->'summary'->>'active_loan_balance')::numeric<>400000
    OR j->'loans'->0->>'outstanding_balance'<>'400000.00'
 THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 settlement did not reconcile both matrix sides: %',j;
 END IF;

 blocked:=false;
 BEGIN
  PERFORM public.frt_ic_record_settlement(w,loan_id,jsonb_build_object(
   'amount','500000.00','settledOn',CURRENT_DATE::text,'reference','IC01-SET-OVER'));
 EXCEPTION WHEN SQLSTATE '22023' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'CP-FRT-IC-01 over-settlement was accepted'; END IF;

 blocked:=false;
 BEGIN
  PERFORM public.frt_ic_create_obligation(w,jsonb_build_object(
   'kind','LOAN','reference','IC01-LOAN-001','creditorCode','WAO',
   'debtorCode','PSTI','amount','100.00','issuedOn',CURRENT_DATE::text,
   'dueOn',(CURRENT_DATE+30)::text));
 EXCEPTION WHEN unique_violation THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'CP-FRT-IC-01 duplicate obligation reference was accepted'; END IF;

 -- General Manager retains existing finance write capability.
 PERFORM set_config('request.jwt.claim.sub',general_manager::text,true);
 receipt:=public.frt_ic_create_obligation(w,jsonb_build_object(
  'kind','RECEIVABLE','reference','IC01-GM-001','description','GM parity fixture',
  'creditorCode','WASS','debtorCode','PSTI','amount','100.00',
  'issuedOn',CURRENT_DATE::text,'dueOn',(CURRENT_DATE+20)::text));
 IF receipt->>'ok'<>'true' THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 existing GM finance parity failed: %',receipt;
 END IF;

 -- Existing REQUESTOR membership retains read access, without acquiring
 -- finance-manager write capability.
 PERFORM set_config('request.jwt.claim.sub',requestor::text,true);
 j:=public.frt_ic_snapshot(w);
 IF jsonb_array_length(j->'companies')<>3 THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 existing requestor read membership changed';
 END IF;
 blocked:=false;
 BEGIN
  PERFORM public.frt_ic_create_obligation(w,jsonb_build_object(
   'kind','RECEIVABLE','reference','IC01-REQ-001','creditorCode','WAO',
   'debtorCode','PSTI','amount','10.00','issuedOn',CURRENT_DATE::text));
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'CP-FRT-IC-01 requestor received new finance write authority'; END IF;

 -- Foreign workspace, non-member and unsigned requests remain denied.
 PERFORM set_config('request.jwt.claim.sub',finance_manager::text,true);
 blocked:=false;
 BEGIN
  PERFORM public.frt_ic_snapshot(foreign_workspace);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'CP-FRT-IC-01 foreign workspace read was allowed'; END IF;

 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000c',true);
 blocked:=false;
 BEGIN
  PERFORM public.frt_ic_snapshot(w);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'CP-FRT-IC-01 nonmember read was allowed'; END IF;

 PERFORM set_config('request.jwt.claim.sub','',true);
 blocked:=false;
 BEGIN
  PERFORM public.frt_ic_snapshot(w);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'CP-FRT-IC-01 unsigned read was allowed'; END IF;

 RAISE NOTICE 'CP-FRT-IC-01 DISPOSABLE ACCEPTANCE: PASS';
END;
$acceptance$;
RESET ROLE;

DO $audit$
BEGIN
 IF (SELECT count(*) FROM public.frt_ic_obligations)<>3
    OR (SELECT count(*) FROM public.frt_ic_settlements)<>1
    OR (SELECT count(*) FROM public.frt_audit_logs
        WHERE action IN ('FRT_IC_OBLIGATION_CREATED','FRT_IC_SETTLEMENT_RECORDED'))<>4
    OR (SELECT count(*) FROM public.frt_requests)<>2
    OR (SELECT count(*) FROM public.frt_liquidations)<>0
 THEN
  RAISE EXCEPTION 'CP-FRT-IC-01 audit or existing FRT records changed unexpectedly';
 END IF;
END;
$audit$;

ROLLBACK;
