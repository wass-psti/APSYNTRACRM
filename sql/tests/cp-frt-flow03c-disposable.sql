-- CP-FRT-FLOW-03C — company metadata and atomic request-scoped accounting acceptance.
-- All records in this test are rolled back.
BEGIN;
DO $test$
DECLARE
 v_workspace uuid;
 v_actor uuid;
 v_company_id uuid;
 v_request_id uuid;
 v_detail jsonb;
 v_voucher jsonb;
 v_snapshot jsonb;
 v_logo_path text;
 v_result jsonb;
 v_profile_result jsonb;
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

 v_profile_result:=public.frt_update_company_profile(v_workspace,'WAO',
  'Watchdog Automation OPC','WAO Company Address','+63 32 111 0101','wao@example.test',NULL,'010-737-641-000');
 PERFORM public.frt_update_company_profile(v_workspace,'WASS',
  'Watchdog Automation Sales & Services','WASS Company Address','+63 32 222 0202','wass@example.test',v_logo_path,'211-258-356-00000');
 PERFORM public.frt_update_company_profile(v_workspace,'PSTI',
  'Process Solutions Technology Inc.','PSTI Company Address','+63 32 333 0303','psti@example.test',NULL,'463-678-854-000');
 -- Existing seven-argument clients remain compatible and preserve the TIN.
 PERFORM public.frt_update_company_profile(v_workspace,'WAO',
  'Watchdog Automation OPC','WAO Company Address','+63 32 111 0101','wao@example.test',NULL);
 IF v_profile_result->'company'->>'taxIdNumber'<>'010-737-641-000' THEN
  RAISE EXCEPTION 'Eight-argument company profile RPC omitted the saved TIN: %',v_profile_result;
 END IF;

 SELECT count(*) INTO v_company_count FROM public.frt_companies
 WHERE workspace_id=v_workspace AND registered_address IS NOT NULL
  AND contact_phone IS NOT NULL AND contact_email IS NOT NULL
  AND tax_id_number IS NOT NULL;
 IF v_company_count<>3 THEN
  RAISE EXCEPTION 'Company profiles and TINs did not persist independently for all three FRT companies: %',v_company_count;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.frt_companies WHERE workspace_id=v_workspace
  AND code='WASS' AND tax_id_number='211-258-356-00000') THEN
  RAISE EXCEPTION 'WASS TIN did not persist';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.frt_companies WHERE workspace_id=v_workspace AND code='WASS'
  AND logo_path=v_logo_path) OR
  NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='frt-attachments' AND name=v_logo_path) THEN
  RAISE EXCEPTION 'WASS company logo object and persisted reference did not reconcile';
 END IF;

 SELECT id INTO STRICT v_company_id
 FROM public.frt_companies WHERE workspace_id=v_workspace AND code='WASS';
 v_request_id:=gen_random_uuid();
 INSERT INTO public.frt_requests(
  id,workspace_id,company_id,requestor_id,voucher_no,title,department,fund_source,
  recipient_name,recipient_bank,recipient_account,date_needed,description,
  order_intake_no,check_no,total_amount,status,liquidation_status,created_at
 ) VALUES (
  v_request_id,v_workspace,v_company_id,v_actor,'DV-WASS-202611-001',
  'CP-FRT-FLOW-03C accounting acceptance','Operations','WASS Operating Account',
  'Accounting Acceptance Supplier','BPI','9876543210','2026-11-20',
  'Rollback-only company profile and double-entry accounting acceptance',
  'OI-FLOW03C-001','CHK-FLOW03C-001',150.50,'PENDING_APPROVAL','NOT_SUBMITTED',now()
 );
 INSERT INTO public.frt_request_items(workspace_id,fund_request_id,category,amount,notes)
 VALUES
  (v_workspace,v_request_id,'Office Supplies',100.25,'Stationery'),
  (v_workspace,v_request_id,'Freight',50.25,'Delivery');
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
    v_voucher->'company'->>'address'<>'WASS Company Address' OR
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

 RAISE NOTICE 'CP-FRT-FLOW-03C/03E PASS: WAO/WASS/PSTI company metadata and TINs, backward-compatible profile RPC, private logo reference, preserved existing DV number, exact-cent double-entry persistence, canonical projection, stale-write conflict and atomic unbalanced-write rejection';
END
$test$;
ROLLBACK;
