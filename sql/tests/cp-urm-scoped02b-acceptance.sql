\set ON_ERROR_STOP on
DO $acceptance$
DECLARE
 w uuid:='11111111-1111-4111-8111-111111111111';
 other_w uuid:='22222222-2222-4222-8222-222222222222';
 admin_id uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 target_id uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 bootstrap_id uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 module_name text;selected_role text;prior_role text;
 revision timestamptz;result jsonb;source jsonb;effective jsonb;
BEGIN
 PERFORM set_config('test.workspace',w::text,true);
 PERFORM set_config('test.actor',admin_id::text,true);
 FOR module_name,selected_role IN
  SELECT * FROM (VALUES
   ('time-tracker','Employee'),('fueltrack-plus','User'),
   ('tradelink','User'),('order-intake','User'),
   ('employee-eval','employee'),('aps-aims','Custodian')) m(module_id,assigned_role)
 LOOP
  SELECT role INTO prior_role FROM public.module_role_assignments
   WHERE user_id=target_id AND module_id=module_name;
  result:=public.apsyntra_role_scoped_six_set(
   w,target_id,module_name,selected_role,true,NULL);
  IF result->>'effective'<>'true' OR result->>'role'<>selected_role
   OR result->>'enabled'<>'true' THEN
   RAISE EXCEPTION 'Workspace role write failed for %: %',module_name,result;
  END IF;
  revision:=(result->>'updatedAt')::timestamptz;
  source:=public.apsyntra_role_scoped_six_snapshot(w);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source->'assignments') a
   WHERE a->>'userId'=target_id::text AND a->>'moduleId'=module_name
    AND a->>'role'=selected_role AND a->>'enabled'='true') THEN
   RAISE EXCEPTION 'Authoritative snapshot mismatch for %',module_name;
  END IF;
  PERFORM set_config('test.actor',target_id::text,true);
  IF public.module_role_for(module_name) IS DISTINCT FROM selected_role OR
    public.has_module_access(module_name) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Active workspace operational role missing for %',module_name;
  END IF;
  effective:=public.apsyntra_crm_my_effective_access();
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(effective->'modules') a
   WHERE a->>'moduleId'=module_name AND a->>'role'=selected_role
    AND a->>'allowed'='true') THEN
   RAISE EXCEPTION 'CRM role projection mismatch for %',module_name;
  END IF;
  PERFORM set_config('test.workspace',other_w::text,true);
  IF public.module_role_for(module_name) IS DISTINCT FROM prior_role THEN
   RAISE EXCEPTION 'Foreign workspace role changed for %',module_name;
  END IF;
  PERFORM set_config('test.workspace',w::text,true);
  PERFORM set_config('test.actor',admin_id::text,true);
  BEGIN
   PERFORM public.apsyntra_role_scoped_six_set(
    w,target_id,module_name,selected_role,true,NULL);
   RAISE EXCEPTION 'Stale version accepted for %',module_name;
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  result:=public.apsyntra_role_scoped_six_set(
   w,target_id,module_name,selected_role,false,revision);
  IF result->>'enabled'<>'false' THEN RAISE EXCEPTION 'Revocation failed: %',module_name; END IF;
  PERFORM set_config('test.actor',target_id::text,true);
  IF public.module_role_for(module_name) IS NOT NULL OR
     public.has_module_access(module_name) IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'Revoked role still operational in workspace for %',module_name;
  END IF;
  effective:=public.apsyntra_crm_my_effective_access();
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(effective->'modules') a
   WHERE a->>'moduleId'=module_name AND a->>'allowed'='true') THEN
   RAISE EXCEPTION 'Revocation did not clear CRM projection for %',module_name;
  END IF;
  PERFORM set_config('test.workspace',other_w::text,true);
  IF public.module_role_for(module_name) IS DISTINCT FROM prior_role THEN
   RAISE EXCEPTION 'Revocation crossed workspace for %',module_name;
  END IF;
  PERFORM set_config('test.workspace',w::text,true);
  PERFORM set_config('test.actor',admin_id::text,true);
 END LOOP;
 IF (SELECT count(*) FROM public.apsyntra_role_change_requests
 WHERE payload->>'source'='workspace_module_roles')<>12 OR
    (SELECT count(*) FROM public.apsyntra_role_change_audit
 WHERE detail->>'source'='workspace_module_roles')<>12 THEN
  RAISE EXCEPTION 'Role-write/revoke audit receipts missing';
 END IF;
 BEGIN
  PERFORM public.apsyntra_role_scoped_six_set(w,bootstrap_id,'time-tracker','Employee',true,NULL);
  RAISE EXCEPTION 'Protected bootstrap role modified';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_scoped_six_set(w,admin_id,'time-tracker','Employee',true,NULL);
  RAISE EXCEPTION 'Self role modified';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_scoped_six_set(other_w,target_id,'time-tracker','Employee',true,NULL);
  RAISE EXCEPTION 'Foreign workspace mutated';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_scoped_six_set(w,target_id,'charter-navigator','Employee',true,NULL);
  RAISE EXCEPTION 'Unconverted Charter module permitted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END
$acceptance$;
SELECT 'CP_URM_SCOPED02B_SIX_DISPOSABLE_PASS' AS result;
