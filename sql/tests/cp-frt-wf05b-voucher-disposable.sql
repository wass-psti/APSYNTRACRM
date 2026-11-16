-- CP-FRT-WF-05B monthly voucher and duplicate-guard acceptance.
-- All test records are created inside a transaction and rolled back.
BEGIN;
DO $test$
DECLARE
 v_workspace uuid;
 v_actor uuid;
 v_wass jsonb;
 v_wao jsonb;
 v_december jsonb;
 v_duplicate_blocked boolean:=false;
 v_invalid_beneficiary_blocked boolean:=false;
 v_payload jsonb;
 v_count integer;
BEGIN
 SELECT id INTO STRICT v_workspace FROM public.workspaces
 ORDER BY id LIMIT 1;
 SELECT id INTO STRICT v_actor FROM auth.users ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);

 INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status)
 VALUES(v_workspace,v_actor,'GENERAL_MANAGER',true,'active')
 ON CONFLICT(workspace_id,user_id) DO UPDATE
 SET role='GENERAL_MANAGER',enabled=true,status='active';

 v_payload:=jsonb_build_object(
  'company','WASS',
  'title','CP-FRT-WF-05B disposable request',
  'department','Operations',
  'fundSource','WASS Operating Account',
  'requestDate','2026-11-17',
  'dateNeeded','2026-11-30',
  'description','Disposable monthly voucher acceptance',
  'recipientName','Supplier A',
  'recipientBank','BPI',
  'recipientAccount','1234567890',
  'items',jsonb_build_array(
   jsonb_build_object('category','Office Supplies','amount','100.00'),
   jsonb_build_object('category','Freight','amount','50.50')
  )
 );

 v_wass:=public.frt_create_request(v_workspace,v_payload);
 IF v_wass->>'voucher_no'<>'DV-WASS-202611-001' THEN
  RAISE EXCEPTION 'First WASS monthly voucher mismatch: %',v_wass->>'voucher_no';
 END IF;
 IF (v_wass->>'total_amount')::numeric<>150.50 THEN
  RAISE EXCEPTION 'Expense total mismatch: %',v_wass->>'total_amount';
 END IF;

 BEGIN
  PERFORM public.frt_create_request(v_workspace,v_payload);
 EXCEPTION WHEN unique_violation THEN
  v_duplicate_blocked:=true;
 END;
 IF NOT v_duplicate_blocked THEN
  RAISE EXCEPTION 'Ten-minute server duplicate guard did not block the repeat request.';
 END IF;

 v_wass:=public.frt_create_request(
  v_workspace,v_payload||jsonb_build_object('allowPotentialDuplicate',true)
 );
 IF v_wass->>'voucher_no'<>'DV-WASS-202611-002' THEN
  RAISE EXCEPTION 'Confirmed WASS duplicate voucher mismatch: %',v_wass->>'voucher_no';
 END IF;

 v_december:=public.frt_create_request(
  v_workspace,v_payload||jsonb_build_object(
   'requestDate','2026-12-01','recipientName','Supplier B'
  )
 );
 IF v_december->>'voucher_no'<>'DV-WASS-202612-001' THEN
  RAISE EXCEPTION 'New month did not reset WASS sequence: %',v_december->>'voucher_no';
 END IF;

 v_wao:=public.frt_create_request(
  v_workspace,v_payload||jsonb_build_object('company','WAO')
 );
 IF v_wao->>'voucher_no'<>'DV-WAO-202611-001' THEN
  RAISE EXCEPTION 'Company-specific sequence did not reset for WAO: %',v_wao->>'voucher_no';
 END IF;

 BEGIN
  PERFORM public.frt_create_request(
   v_workspace,v_payload-'recipientAccount'
  );
 EXCEPTION WHEN invalid_parameter_value THEN
  v_invalid_beneficiary_blocked:=true;
 END;
 IF NOT v_invalid_beneficiary_blocked THEN
  RAISE EXCEPTION 'Missing beneficiary destination account was accepted.';
 END IF;

 SELECT count(*) INTO v_count FROM public.frt_request_items
 WHERE workspace_id=v_workspace;
 IF v_count<>8 THEN
  RAISE EXCEPTION 'Expected eight persisted expense items, found %',v_count;
 END IF;

 IF NOT EXISTS(
  SELECT 1 FROM public.frt_voucher_counters
  WHERE workspace_id=v_workspace AND voucher_year=2026 AND voucher_month=11
   AND last_number=2
 ) OR NOT EXISTS(
  SELECT 1 FROM public.frt_voucher_counters
  WHERE workspace_id=v_workspace AND voucher_year=2026 AND voucher_month=12
   AND last_number=1
 ) THEN
  RAISE EXCEPTION 'Monthly voucher counters are inconsistent.';
 END IF;

 RAISE NOTICE 'CP-FRT-WF-05B PASS: month/company sequence, duplicate guard, explicit override, beneficiary validation and item persistence';
END
$test$;
ROLLBACK;
