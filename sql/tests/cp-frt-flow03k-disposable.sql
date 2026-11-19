-- DISPOSABLE transaction only. Fictional IDs and payees; no production records.
BEGIN;
INSERT INTO public.frt_companies(id,workspace_id,code,name,display_order)
VALUES('00000000-0000-4000-8000-000000000010',
 '00000000-0000-4000-8000-000000000001','WASS','Disposable Company',1);
INSERT INTO public.frt_memberships(workspace_id,user_id,role)
VALUES('00000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000002','FINANCE_MANAGER'),
 ('00000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000003','REQUESTOR');
INSERT INTO public.frt_requests(id,workspace_id,company_id,requestor_id,voucher_no,
 title,department,fund_source,recipient_name,date_needed,description,total_amount)
VALUES('00000000-0000-4000-8000-000000000020',
 '00000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000010',
 '00000000-0000-4000-8000-000000000003',
 'DV-WASS-209901-001','Disposable request','Office','Bank','None',
 '2099-01-31','Disposable finance fixture',3000.00);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $t$
DECLARE v jsonb;
BEGIN
 v:=public.frt_correct_request_payee_cas(
 '00000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000020','None','Valid Fictional Supplier');
 IF v->>'payee'<>'Valid Fictional Supplier' OR
  v->>'voucherNumber'<>'DV-WASS-209901-001' THEN
  RAISE EXCEPTION 'Successful correction did not preserve original voucher';
 END IF;
END $t$;
DO $t$
BEGIN
 BEGIN
  PERFORM public.frt_correct_request_payee_cas(
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000020',
   'None','Second Fictional Supplier');
  RAISE EXCEPTION 'STALE_WRITE_NOT_DENIED';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
 BEGIN
  PERFORM public.frt_correct_request_payee_cas(
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000020',
   'Valid Fictional Supplier','None');
  RAISE EXCEPTION 'INVALID_NAME_NOT_DENIED';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
 BEGIN
  PERFORM public.frt_correct_request_payee_cas(
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000020',
   'Valid Fictional Supplier','Unauthorized Supplier');
  RAISE EXCEPTION 'WRONG_ROLE_NOT_DENIED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $t$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
INSERT INTO public.frt_request_accounting_lines(workspace_id,fund_request_id)
VALUES('00000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000020');
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
 BEGIN
  PERFORM public.frt_correct_request_payee_cas(
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000020',
   'Valid Fictional Supplier','Accounting Blocked Supplier');
  RAISE EXCEPTION 'ACCOUNTING_STATE_NOT_DENIED';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
END $t$;
RESET ROLE;
DELETE FROM public.frt_request_accounting_lines;
UPDATE public.frt_requests SET finance_approved_at=now()
 WHERE id='00000000-0000-4000-8000-000000000020';
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
 BEGIN
  PERFORM public.frt_correct_request_payee_cas(
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000020',
   'Valid Fictional Supplier','Approved Blocked Supplier');
  RAISE EXCEPTION 'APPROVED_STATE_NOT_DENIED';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
END $t$;
RESET ROLE;
DO $t$
DECLARE v public.frt_requests%ROWTYPE;
BEGIN
 SELECT * INTO v FROM public.frt_requests
  WHERE id='00000000-0000-4000-8000-000000000020';
 IF v.recipient_name<>'Valid Fictional Supplier' OR
  v.voucher_no<>'DV-WASS-209901-001' OR v.total_amount<>3000.00 OR
  (SELECT count(*) FROM public.frt_audit_logs
   WHERE fund_request_id=v.id AND action='REQUEST_PAYEE_CORRECTED')<>1 THEN
  RAISE EXCEPTION 'Payee correction invariants or audit count failed';
 END IF;
END $t$;
ROLLBACK;
