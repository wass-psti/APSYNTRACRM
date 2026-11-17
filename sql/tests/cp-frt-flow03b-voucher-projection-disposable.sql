-- CP-FRT-FLOW-03B: verify the canonical read-only voucher projection against
-- the existing FRT request and expense records. All rows roll back.
BEGIN;
DO $test$
DECLARE
 v_workspace uuid;
 v_actor uuid;
 v_request jsonb;
 v_request_id uuid;
 v_detail jsonb;
 v_voucher jsonb;
 v_payload jsonb:=jsonb_build_object(
  'company','WASS',
  'title','CP-FRT-FLOW-03B disposable voucher projection',
  'department','Operations',
  'fundSource','WASS Operating Account',
  'requestDate','2026-11-17',
  'dateNeeded','2026-11-20',
  'description','Rollback-only signed voucher projection acceptance',
  'recipientName','Projection Test Supplier',
  'recipientBank','BPI',
  'recipientAccount','9876543210',
  'orderIntakeNo','OI-FLOW03B-001',
  'checkNo','CHK-FLOW03B-001',
  'items',jsonb_build_array(
   jsonb_build_object('category','Office Supplies','amount','100.25','notes','Paper and stationery'),
   jsonb_build_object('category','Freight','amount','50.25','notes','Delivery charge')
  )
 );
BEGIN
 SELECT id INTO STRICT v_workspace FROM public.workspaces ORDER BY id LIMIT 1;
 SELECT id INTO STRICT v_actor FROM auth.users ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);

 INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status,display_name)
 VALUES(v_workspace,v_actor,'GENERAL_MANAGER',true,'active','Disposable General Manager')
 ON CONFLICT(workspace_id,user_id) DO UPDATE
 SET role='GENERAL_MANAGER',enabled=true,status='active',display_name='Disposable General Manager';

 v_request:=public.frt_create_request(v_workspace,v_payload);
 v_request_id:=(v_request->>'id')::uuid;
 IF v_request->>'voucher_no'<>'DV-WASS-202611-001' THEN
  RAISE EXCEPTION 'Monthly voucher number was not preserved in the projection source: %',v_request->>'voucher_no';
 END IF;

 UPDATE public.frt_requests SET
  status='IN_PROGRESS',
  finance_approved_by=v_actor,finance_approved_at='2026-11-17T01:00:00Z',
  transfer_confirmed_by=v_actor,transfer_confirmed_at='2026-11-17T01:10:00Z',
  transfer_reference='GM-FLOW03B-001'
 WHERE workspace_id=v_workspace AND id=v_request_id;

 v_detail:=public.frt_restricted_request_detail(v_workspace,v_request_id);
 v_voucher:=v_detail->'voucher';
 IF v_detail->>'id'<>v_request_id::text OR
    v_detail->>'workspace_id'<>v_workspace::text OR
    v_detail->>'company_code'<>'WASS' OR
    v_detail->>'voucher_no'<>'DV-WASS-202611-001' THEN
  RAISE EXCEPTION 'Restricted request detail identity mismatch: %',v_detail;
 END IF;
 IF v_voucher->>'workspaceId'<>v_workspace::text OR
    v_voucher->>'requestId'<>v_request_id::text OR
    v_voucher->>'voucherNumber'<>'DV-WASS-202611-001' OR
    v_voucher->'company'->>'name'<>'Watchdog Automation Sales & Services' OR
    v_voucher->>'payee'<>'Projection Test Supplier' OR
    v_voucher->>'payeeBank'<>'BPI' OR
    v_voucher->>'totalAmount'<>'150.50' OR
    v_voucher->>'itemsTotal'<>'150.50' OR
    v_voucher->>'reconciled'<>'true' THEN
  RAISE EXCEPTION 'Persisted voucher projection failed identity or exact-cent reconciliation: %',v_voucher;
 END IF;
 IF jsonb_array_length(v_voucher->'items')<>2 OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_voucher->'items') i
     WHERE i->>'category'='Office Supplies' AND i->>'amount'='100.25') OR
    NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_voucher->'items') i
     WHERE i->>'category'='Freight' AND i->>'amount'='50.25') THEN
  RAISE EXCEPTION 'Voucher projection did not preserve persisted expense itemization: %',v_voucher->'items';
 END IF;
 IF v_voucher->'financeApproval'->>'approvedBy'<>'Disposable General Manager' OR
    v_voucher->'gmVerification'->>'verifiedBy'<>'Disposable General Manager' OR
    v_voucher->'gmVerification'->>'reference'<>'GM-FLOW03B-001' THEN
  RAISE EXCEPTION 'Voucher projection did not preserve approval and GM verification records: %',v_voucher;
 END IF;
 IF v_voucher->'company' ? 'address' OR v_voucher ? 'accountingLines' OR
    to_regclass('public.frt_vouchers') IS NOT NULL OR
    to_regclass('public.frt_voucher_accounting_lines') IS NOT NULL OR
    to_regclass('public.frt_company_profiles') IS NOT NULL THEN
  RAISE EXCEPTION 'Voucher projection introduced unverified company fields or a competing persistence architecture.';
 END IF;

 RAISE NOTICE 'CP-FRT-FLOW-03B PASS: existing signed request-detail RPC, monthly DV number, persisted itemization, exact-cent reconciliation, approval provenance and no duplicate voucher schema';
END
$test$;
ROLLBACK;
