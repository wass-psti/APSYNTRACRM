-- CP-FRT-FLOW-03C — company metadata and atomic request-scoped accounting acceptance.
-- All records in this test are rolled back.
BEGIN;
DO $test$
DECLARE
 v_workspace uuid;
 v_actor uuid;
 v_request jsonb;
 v_request_id uuid;
 v_detail jsonb;
 v_voucher jsonb;
 v_snapshot jsonb;
 v_logo_path text;
 v_result jsonb;
 v_company_count integer;
BEGIN
 SELECT id INTO STRICT v_workspace FROM public.workspaces ORDER BY id LIMIT 1;
 SELECT id INTO STRICT v_actor FROM auth.users ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
 INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status,display_name)
 VALUES(v_workspace,v_actor,'REQUESTOR',true,'active','Disposable Requestor')
 ON CONFLICT(workspace_id,user_id) DO UPDATE
 SET role='REQUESTOR',enabled=true,status='active',display_name='Disposable Requestor';

 v_logo_path:=v_workspace::text||'/company-profiles/WASS/33333333-3333-4333-8333-333333333333.png';
 INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
 VALUES('frt-attachments',v_logo_path,v_actor::text,jsonb_build_object('mimetype','image/png'));

 PERFORM public.frt_update_company_profile(v_workspace,'WAO',
  'Watchdog Automation OPC','WAO Registered Address','+63 32 111 0101','wao@example.test',NULL);
 PERFORM public.frt_update_company_profile(v_workspace,'WASS',
  'Watchdog Automation Sales & Services','WASS Registered Address','+63 32 222 0202','wass@example.test',v_logo_path);
 PERFORM public.frt_update_company_profile(v_workspace,'PSTI',
  'Process Solutions Technology Inc.','PSTI Registered Address','+63 32 333 0303','psti@example.test',NULL);

 SELECT count(*) INTO v_company_count FROM public.frt_companies
 WHERE workspace_id=v_workspace AND registered_address IS NOT NULL
  AND contact_phone IS NOT NULL AND contact_email IS NOT NULL;
 IF v_company_count<>3 THEN
  RAISE EXCEPTION 'Company profiles did not persist independently for all three FRT companies: %',v_company_count;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.frt_companies WHERE workspace_id=v_workspace AND code='WASS'
  AND logo_path=v_logo_path) OR
  NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='frt-attachments' AND name=v_logo_path) THEN
  RAISE EXCEPTION 'WASS company logo object and persisted reference did not reconcile';
 END IF;

 v_request:=public.frt_create_request(v_workspace,jsonb_build_object(
  'company','WASS','title','CP-FRT-FLOW-03C accounting acceptance',
  'department','Operations','fundSource','WASS Operating Account',
  'requestDate','2026-11-17','dateNeeded','2026-11-20',
  'description','Rollback-only company profile and double-entry accounting acceptance',
  'recipientName','Accounting Acceptance Supplier','recipientBank','BPI',
  'recipientAccount','9876543210','orderIntakeNo','OI-FLOW03C-001',
  'checkNo','CHK-FLOW03C-001','items',jsonb_build_array(
   jsonb_build_object('category','Office Supplies','amount','100.25','notes','Stationery'),
   jsonb_build_object('category','Freight','amount','50.25','notes','Delivery')
  )
 ));
 v_request_id:=(v_request->>'id')::uuid;
 IF v_request->>'voucher_no'<>'DV-WASS-202611-001' THEN
  RAISE EXCEPTION 'CP-FRT-FLOW-03C unexpectedly changed monthly DV numbering: %',v_request->>'voucher_no';
 END IF;

 v_result:=public.frt_save_request_accounting_lines(v_workspace,v_request_id,0,
  jsonb_build_array(
   jsonb_build_object('accountCode','1010','accountName','Cash / Bank','description','Manual debit entry','debitCents',15050,'creditCents',0),
   jsonb_build_object('accountCode','2010','accountName','Accounts Payable','description','Manual credit entry','debitCents',0,'creditCents',15050)
  ));
 IF (v_result->>'revision')::integer<>1 OR v_result->>'balanced'<>'true' OR
    v_result->>'debitTotal'<>'150.50' OR v_result->>'creditTotal'<>'150.50' OR
    jsonb_array_length(v_result->'lines')<>2 THEN
  RAISE EXCEPTION 'Atomic accounting save did not return balanced readback: %',v_result;
 END IF;

 v_detail:=public.frt_restricted_request_detail(v_workspace,v_request_id);
 v_voucher:=v_detail->'voucher';
 IF v_voucher->>'voucherNumber'<>'DV-WASS-202611-001' OR
    v_voucher->'company'->>'address'<>'WASS Registered Address' OR
    v_voucher->'company'->>'phone'<>'+63 32 222 0202' OR
    v_voucher->'company'->>'email'<>'wass@example.test' OR
    v_voucher->'company'->>'logoPath'<>v_logo_path OR
    v_voucher->'accounting'->>'balanced'<>'true' OR
    v_voucher->'accounting'->>'debitTotal'<>'150.50' OR
    v_voucher->'accounting'->>'creditTotal'<>'150.50' OR
    jsonb_array_length(v_voucher->'accounting'->'lines')<>2 THEN
  RAISE EXCEPTION 'Canonical signed voucher projection omitted persisted company or accounting details: %',v_voucher;
 END IF;

 BEGIN
  PERFORM public.frt_save_request_accounting_lines(v_workspace,v_request_id,0,
   jsonb_build_array(
    jsonb_build_object('accountCode','1010','accountName','Cash / Bank','description','','debitCents',15050,'creditCents',0),
    jsonb_build_object('accountCode','2010','accountName','Accounts Payable','description','','debitCents',0,'creditCents',15050)
   ));
  RAISE EXCEPTION 'Stale accounting revision unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;

 BEGIN
  PERFORM public.frt_save_request_accounting_lines(v_workspace,v_request_id,1,
   jsonb_build_array(
    jsonb_build_object('accountCode','1010','accountName','Cash / Bank','description','','debitCents',15050,'creditCents',0),
    jsonb_build_object('accountCode','2010','accountName','Accounts Payable','description','','debitCents',0,'creditCents',15049)
   ));
  RAISE EXCEPTION 'Unbalanced accounting unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 BEGIN
  PERFORM public.frt_save_request_accounting_lines(v_workspace,v_request_id,1,
   jsonb_build_array(
    jsonb_build_object('accountCode','1010','accountName','Cash / Bank','description','','debitCents',-15050,'creditCents',0),
    jsonb_build_object('accountCode','2010','accountName','Accounts Payable','description','','debitCents',0,'creditCents',15050)
   ));
  RAISE EXCEPTION 'Negative accounting amount unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 BEGIN
  PERFORM public.frt_save_request_accounting_lines(v_workspace,v_request_id,1,
   jsonb_build_array(
    jsonb_build_object('accountCode','1010','accountName','Cash / Bank','description','','debitCents',15050,'creditCents',1),
    jsonb_build_object('accountCode','2010','accountName','Accounts Payable','description','','debitCents',0,'creditCents',15050)
   ));
  RAISE EXCEPTION 'Two-sided accounting line unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 v_snapshot:=public.frt_request_accounting_snapshot(v_workspace,v_request_id);
 IF (v_snapshot->>'revision')::integer<>1 OR jsonb_array_length(v_snapshot->'lines')<>2 OR
    v_snapshot->>'balanced'<>'true' THEN
  RAISE EXCEPTION 'Failed accounting write partially replaced the persisted revision: %',v_snapshot;
 END IF;

 RAISE NOTICE 'CP-FRT-FLOW-03C PASS: WAO/WASS/PSTI company metadata, private logo reference, unchanged monthly DV number, exact-cent double-entry persistence, canonical projection, stale-write conflict and atomic unbalanced-write rejection';
END
$test$;
ROLLBACK;
