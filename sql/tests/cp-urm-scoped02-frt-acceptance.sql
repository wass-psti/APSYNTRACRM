\set ON_ERROR_STOP on
DO $test$
DECLARE
 w uuid:='11111111-1111-4111-8111-111111111111';
 second_w uuid:='22222222-2222-4222-8222-222222222222';
 actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 target uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 protected uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 response jsonb; snap jsonb; rev timestamptz;
BEGIN
 PERFORM set_config('test.actor',target::text,true);
 IF private.frt_current_role(w) IS DISTINCT FROM 'FINANCE_APPROVER' THEN
  RAISE EXCEPTION 'Legacy operational FRT role fallback broken'; END IF;
 PERFORM set_config('test.actor',actor::text,true);
 snap:=public.apsyntra_role_frt_workspace_snapshot(w);
 IF jsonb_array_length(snap->'assignments')<>0 THEN RAISE EXCEPTION 'Expected no scoped roles'; END IF;
 response:=public.apsyntra_role_frt_workspace_set(w,target,'REQUESTOR',true,NULL);
 IF response->>'enabled'<>'true' OR response->>'role'<>'REQUESTOR' THEN
  RAISE EXCEPTION 'Scoped assignment failed: %',response; END IF;
 rev:=(response->>'updatedAt')::timestamptz;
 snap:=public.apsyntra_role_frt_workspace_snapshot(w);
 IF snap#>>'{assignments,0,role}'<>'REQUESTOR' THEN
  RAISE EXCEPTION 'Source assignment readback mismatch'; END IF;
 PERFORM set_config('test.actor',target::text,true);
 IF private.frt_current_role(w)<>'REQUESTOR' THEN
  RAISE EXCEPTION 'Operational FRT role not updated in workspace'; END IF;
 IF private.frt_current_role(second_w)<>'FINANCE_APPROVER' THEN
  RAISE EXCEPTION 'Other workspace global fallback unexpectedly changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.apsyntra_crm_my_effective_access()) x
   WHERE x->>'moduleId'='fund-released-tracker' AND x->>'role'='REQUESTOR') THEN
  RAISE EXCEPTION 'CRM effective role still stale'; END IF;
 PERFORM set_config('test.actor',actor::text,true);
 BEGIN
  PERFORM public.apsyntra_role_frt_workspace_set(w,target,'FINANCE_MANAGER',true,NULL);
  RAISE EXCEPTION 'Stale version accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 response:=public.apsyntra_role_frt_workspace_set(w,target,'FINANCE_MANAGER',true,rev);
 response:=public.apsyntra_role_frt_workspace_set(w,target,'FINANCE_MANAGER',false,
  (response->>'updatedAt')::timestamptz);
 PERFORM set_config('test.actor',target::text,true);
 IF private.frt_current_role(w) IS NOT NULL THEN
  RAISE EXCEPTION 'Revoked scoped role still grants domain access'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.apsyntra_crm_my_effective_access()) x
   WHERE x->>'moduleId'='fund-released-tracker' AND x->>'allowed'='true') THEN
  RAISE EXCEPTION 'Revoked role still grants shell access'; END IF;
 PERFORM set_config('test.actor',actor::text,true);
 BEGIN
  PERFORM public.apsyntra_role_frt_workspace_set(w,protected,'REQUESTOR',true,NULL);
  RAISE EXCEPTION 'Protected target mutated';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_frt_workspace_set(w,actor,'REQUESTOR',true,NULL);
  RAISE EXCEPTION 'Self target mutated';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_frt_workspace_set(second_w,target,'REQUESTOR',true,NULL);
  RAISE EXCEPTION 'Wrong workspace mutated';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.apsyntra_role_change_requests WHERE payload->>'resourceId'='fund-released-tracker')<>3 OR
    (SELECT count(*) FROM public.apsyntra_role_change_audit WHERE detail->>'resourceId'='fund-released-tracker')<>3 THEN
  RAISE EXCEPTION 'Audit receipts incomplete'; END IF;
END;
$test$;
SELECT 'CP_URM_SCOPED02_FRT_DISPOSABLE_PASS' AS result;
