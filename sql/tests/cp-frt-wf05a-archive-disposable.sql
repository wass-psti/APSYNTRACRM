-- CP-FRT-WF-05A disposable archive/recovery acceptance. All rows roll back.
BEGIN;
DO $test$
DECLARE
 v_workspace uuid;v_company text;v_company_id uuid;v_actor uuid;v_request uuid;
 v_archive jsonb;v_receipt jsonb;
BEGIN
 SELECT c.workspace_id,c.code,c.id INTO STRICT v_workspace,v_company,v_company_id
 FROM public.frt_companies c ORDER BY c.workspace_id,c.display_order LIMIT 1;
 SELECT u.id INTO STRICT v_actor FROM auth.users u ORDER BY u.id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
 INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status)
 VALUES(v_workspace,v_actor,'GENERAL_MANAGER',true,'active')
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='GENERAL_MANAGER',enabled=true,status='active';
 INSERT INTO public.frt_requests(workspace_id,company_id,requestor_id,voucher_no,title,
  department,fund_source,date_needed,description,total_amount)
 VALUES(v_workspace,v_company_id,v_actor,'WF05A-'||gen_random_uuid(),
  'CP-FRT-WF-05A disposable archived request','IT','OPEX',current_date,
  'Rollback-only archive acceptance',100.00) RETURNING id INTO v_request;
 PERFORM public.frt_request_action(v_workspace,v_request,'archive','{}'::jsonb);
 v_archive:=public.frt_archive_list(v_workspace,v_company,'',500);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_archive) a
  WHERE a->>'request_id'=v_request::text) THEN
  RAISE EXCEPTION 'FRT archive list did not return the archived request: %',v_archive;
 END IF;
 v_receipt:=public.frt_restore_request(v_workspace,v_request);
 IF v_receipt->>'ok'<>'true' OR v_receipt->>'requestId'<>v_request::text OR
  v_receipt->'archivedAt'<>'null'::jsonb THEN
  RAISE EXCEPTION 'FRT restore receipt is invalid: %',v_receipt;
 END IF;
 v_archive:=public.frt_archive_list(v_workspace,v_company,'',500);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_archive) a
  WHERE a->>'request_id'=v_request::text) THEN
  RAISE EXCEPTION 'Restored request remains in archive.';
 END IF;
 RAISE NOTICE 'CP-FRT-WF-05A PASS: archive retrieval and recovery';
END
$test$;
ROLLBACK;
