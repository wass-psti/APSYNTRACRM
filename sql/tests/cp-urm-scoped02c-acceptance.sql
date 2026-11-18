\set ON_ERROR_STOP on
DO $accept$
DECLARE
 w uuid:='11111111-1111-4111-8111-111111111111';
 foreign_w uuid:='22222222-2222-4222-8222-222222222222';
 actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 target uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 bootstrap uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 r jsonb;s jsonb;rev timestamptz;
BEGIN
 PERFORM set_config('test.workspace',w::text,true);
 PERFORM set_config('test.actor',actor::text,true);
 s:=public.apsyntra_role_charter_workspace_snapshot(w);
 IF s->>'contract'<>'cp-urm-charter-workspace-v1' OR
 jsonb_array_length(s->'assignments')<>0 THEN
 RAISE EXCEPTION 'Unexpected Charter initial scoped snapshot %',s; END IF;
 r:=public.apsyntra_role_charter_workspace_set(w,target,'admin',true,NULL);
 IF r->>'role'<>'admin' OR r->>'enabled'<>'true' THEN
 RAISE EXCEPTION 'Charter scoped role write missing %',r;END IF;
 rev:=(r->>'updatedAt')::timestamptz;
 s:=public.apsyntra_role_charter_workspace_snapshot(w);
 IF s#>>'{assignments,0,role}'<>'admin' THEN
 RAISE EXCEPTION 'Charter snapshot not authoritative';END IF;
 s:=public.charter_admin_roles();
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s) a
  WHERE a->>'user_id'=target::text AND a->>'role'='admin' AND a->>'enabled'='true') THEN
 RAISE EXCEPTION 'Charter domain administrator role projection stale'; END IF;
 PERFORM set_config('test.actor',target::text,true);
 IF public.apsyntra_charter_current_role(target,w)<>'admin'
 OR public.module_role_for('charter-navigator') IS DISTINCT FROM 'admin'
 OR public.has_module_access('charter-navigator') IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Charter operational role not active';END IF;
 r:=public.charter_dispatch(w,'/me','GET','{}'::jsonb);
 IF r->>'id' IS DISTINCT FROM target::text THEN
 RAISE EXCEPTION 'Charter signed domain /me failed: %',r;END IF;
 s:=public.wm_auth_access_context();
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'assignments') a
  WHERE a->>'module_id'='charter-navigator' AND a->>'role'='admin'
   AND a->>'enabled'='true') THEN
 RAISE EXCEPTION 'Charter signed workspace assignment projection failed';END IF;
 s:=public.apsyntra_crm_my_effective_access();
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'modules') a
  WHERE a->>'moduleId'='charter-navigator' AND a->>'role'='admin'
    AND a->>'allowed'='true') THEN
 RAISE EXCEPTION 'Charter CRM module projection stale';END IF;
 PERFORM set_config('test.workspace',foreign_w::text,true);
 IF public.apsyntra_charter_current_role(target,foreign_w)<>'user'
 OR public.module_role_for('charter-navigator')<>'user' THEN
 RAISE EXCEPTION 'Charter foreign workspace legacy role overwritten'; END IF;
 PERFORM set_config('test.actor',actor::text,true);
 PERFORM set_config('test.workspace',w::text,true);
 BEGIN
 PERFORM public.apsyntra_role_charter_workspace_set(w,target,'user',true,NULL);
 RAISE EXCEPTION 'Charter stale write accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;END;
 r:=public.apsyntra_role_charter_workspace_set(w,target,'user',true,rev);
 r:=public.apsyntra_role_charter_workspace_set(w,target,'user',false,
 (r->>'updatedAt')::timestamptz);
 PERFORM set_config('test.actor',target::text,true);
 IF public.apsyntra_charter_current_role(target,w) IS NOT NULL THEN
 RAISE EXCEPTION 'Charter revocation still grants domain role';END IF;
 BEGIN
 PERFORM public.charter_dispatch(w,'/me','GET','{}'::jsonb);
 RAISE EXCEPTION 'Revoked Charter user still accesses domain';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('test.actor',actor::text,true);
 BEGIN
 PERFORM public.apsyntra_role_charter_workspace_set(w,bootstrap,'user',true,NULL);
 RAISE EXCEPTION 'Bootstrap target modified';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
 PERFORM public.apsyntra_role_charter_workspace_set(w,actor,'user',true,NULL);
 RAISE EXCEPTION 'Self role modified';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
 PERFORM public.apsyntra_role_charter_workspace_set(foreign_w,target,'user',true,NULL);
 RAISE EXCEPTION 'Foreign workspace mutated';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF (SELECT count(*) FROM public.apsyntra_role_change_requests
 WHERE payload->>'source'='charter_workspace_roles')<>3 OR
 (SELECT count(*) FROM public.apsyntra_role_change_audit
 WHERE detail->>'source'='charter_workspace_roles')<>3 THEN
 RAISE EXCEPTION 'Charter signed role audit incomplete';END IF;
 -- Existing TimeTracker team directory must now reflect the same scoped
 -- write source as the operational module permissions.
 r:=public.apsyntra_role_scoped_six_set(w,target,'time-tracker','HR',true,NULL);
 s:=public.timetracker_team_directory_snapshot(w);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'assignments') a
  WHERE a->>'userId'=target::text AND a->>'moduleId'='time-tracker'
    AND a->>'role'='HR' AND a->>'enabled'='true') THEN
 RAISE EXCEPTION 'TimeTracker directory not synchronized';END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(s->'assignments') a
 WHERE a->>'userId'=target::text AND a->>'moduleId'='time-tracker')<>1 THEN
 RAISE EXCEPTION 'Duplicate TimeTracker legacy and scoped directory roles';END IF;
END
$accept$;
SELECT 'CP_URM_SCOPED02C_CHARTER_TIMETRACKER_PASS' AS result;
