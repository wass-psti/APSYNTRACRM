\set ON_ERROR_STOP on
BEGIN;
DO $verify_rollback$
DECLARE
 v_workspace uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 v_crm_admin uuid:='11111111-1111-4111-8111-111111111111';
 v_bootstrap uuid:='00000000-0000-4000-8000-000000000001';
 v_inherited uuid:='55555555-5555-4555-8555-555555555555';
 v_module_admin uuid:='66666666-6666-4666-8666-666666666666';
 v_data jsonb;
BEGIN
 IF to_regprocedure('public.apsyntra_role_is_admin()') IS NOT NULL
 OR to_regprocedure('public.apsyntra_role_require_bootstrap_scope(uuid)') IS NOT NULL
 OR to_regprocedure('public.timetracker_team_directory_snapshot(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'CP-URM-04B helper functions remain after rollback'; END IF;
 PERFORM set_config('app.workspace_id',v_workspace::text,true);
 PERFORM set_config('request.jwt.claim.sub',v_crm_admin::text,true);
 BEGIN PERFORM public.apsyntra_role_require_scope(v_workspace);
  RAISE EXCEPTION 'CRM Admin retained central administration after rollback';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 v_data:=public.apsyntra_role_user_management_snapshot(v_workspace);
 IF v_data ? 'adminVerified' OR v_data->>'bootstrapVerified'<>'true'
 THEN RAISE EXCEPTION 'Legacy snapshot contract not restored: %',v_data; END IF;
 PERFORM set_config('request.jwt.claim.sub',v_bootstrap::text,true);
 PERFORM public.apsyntra_role_require_scope(v_workspace);
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_set(v_workspace,v_inherited,'employee',NULL);
  RAISE EXCEPTION 'Inherited platform admin target lock was not restored';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  PERFORM public.wm_admin_set_application_role(v_inherited,'time-tracker','Employee',true);
  RAISE EXCEPTION 'Bootstrap-only application dispatcher was not restored';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',v_crm_admin::text,true);
 BEGIN
  PERFORM public.tool_traceability_admin_set_role(v_workspace,v_inherited,'USER',true);
  RAISE EXCEPTION 'CRM Admin unexpectedly retained Tool Traceability role setter after rollback';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',v_module_admin::text,true);
 PERFORM public.tool_traceability_admin_set_role(v_workspace,v_inherited,'USER',true);
 RAISE NOTICE 'CP-URM-04B rollback PASS: bootstrap-only central guard restored; inherited target lock restored; module-admin access preserved';
END;
$verify_rollback$;
ROLLBACK;
