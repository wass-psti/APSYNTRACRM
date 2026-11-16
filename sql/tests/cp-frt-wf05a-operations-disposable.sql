-- CP-FRT-WF-05A disposable acceptance. Run in a disposable PostgreSQL
-- database after the CP-FRT-WF-05A migration; all inserted rows are rolled back.
BEGIN;
DO $test$
DECLARE
 v_workspace uuid;
 v_company text;
 v_company_id uuid;
 v_actor uuid;
 v_request uuid;
 v_comments jsonb;
 v_events jsonb;
 v_archive jsonb;
 v_receipt jsonb;
BEGIN
 SELECT c.workspace_id,c.code,c.id
 INTO STRICT v_workspace,v_company,v_company_id
 FROM public.frt_companies c ORDER BY c.workspace_id,c.display_order LIMIT 1;
 SELECT u.id INTO STRICT v_actor FROM auth.users u ORDER BY u.id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
 INSERT INTO public.frt_memberships(workspace_id,user_id,role,enabled,status)
 VALUES(v_workspace,v_actor,'GENERAL_MANAGER',true,'active')
 ON CONFLICT(workspace_id,user_id) DO UPDATE
 SET role='GENERAL_MANAGER',enabled=true,status='active';
 INSERT INTO public.frt_requests(
  workspace_id,company_id,requestor_id,voucher_no,title,department,
  fund_source,date_needed,description,total_amount
 ) VALUES(
  v_workspace,v_company_id,v_actor,'WF05A-'||gen_random_uuid(),
  'CP-FRT-WF-05A disposable request','IT','OPEX',current_date,
  'Rollback-only FRT operations acceptance',100.00
 ) RETURNING id INTO v_request;
 PERFORM public.frt_add_comment(v_workspace,v_request,'CP-FRT-WF-05A disposable comment');
 v_comments:=public.frt_request_comments_list(v_workspace,v_request,v_company);
 IF jsonb_array_length(v_comments)<>1 OR
    v_comments->0->>'body'<>'CP-FRT-WF-05A disposable comment' THEN
  RAISE EXCEPTION 'FRT comment readback failed: %',v_comments;
 END IF;
 v_events:=public.frt_activity_list(v_workspace,v_company,1000);
 IF NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_events) e
  WHERE e->>'action'='COMMENT_ADDED' AND e->>'request_id'=v_request::text
 ) THEN
  RAISE EXCEPTION 'FRT activity did not include comment event: %',v_events;
 END IF;
 PERFORM public.frt_request_action(v_workspace,v_request,'archive','{}'::jsonb);
 v_archive:=public.frt_archive_list(v_workspace,v_company,'',500);
 IF NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_archive) a
  WHERE a->>'request_id'=v_request::text
 ) THEN
  RAISE EXCEPTION 'FRT archive listing did not include archived request: %',v_archive;
 END IF;
 v_receipt:=public.frt_restore_request(v_workspace,v_request);
 IF v_receipt->>'ok'<>'true' OR v_receipt->>'requestId'<>v_request::text OR
    v_receipt->'archivedAt'<>'null'::jsonb THEN
  RAISE EXCEPTION 'FRT restore receipt is invalid: %',v_receipt;
 END IF;
 v_archive:=public.frt_archive_list(v_workspace,v_company,'',500);
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_archive) a
  WHERE a->>'request_id'=v_request::text
 ) THEN
  RAISE EXCEPTION 'Restored request remains in archive.';
 END IF;
 RAISE NOTICE 'CP-FRT-WF-05A PASS: comments, activity, archive and recovery';
END
$test$;
ROLLBACK;
