\set ON_ERROR_STOP on
BEGIN;
DO $verify$
DECLARE
 v_admin uuid:='11111111-1111-4111-8111-111111111111';
 v_bootstrap uuid:='00000000-0000-4000-8000-000000000001';
 v_protected uuid:='33333333-3333-4333-8333-333333333333';
 v_inherited uuid:='55555555-5555-4555-8555-555555555555';
 v_employee uuid:='44444444-4444-4444-8444-444444444444';
 v_foreign uuid:='22222222-2222-4222-8222-222222222222';
 v_workspace uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 v_foreign_workspace uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 v_data jsonb;
BEGIN
 PERFORM set_config('app.workspace_id',v_workspace::text,true);

 -- Explicit CRM Admin: administrative authority without bootstrap identity.
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
 IF public.apsyntra_role_is_bootstrap() THEN RAISE EXCEPTION 'CRM Admin misclassified as bootstrap'; END IF;
 IF NOT public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'Explicit CRM Admin denied'; END IF;
 PERFORM public.apsyntra_role_require_scope(v_workspace);
 v_data:=public.apsyntra_role_configuration_snapshot(v_workspace);
 IF v_data->>'adminVerified'<>'true' OR v_data->>'bootstrapVerified'<>'false'
 THEN RAISE EXCEPTION 'CRM role configuration snapshot identity contract incorrect: %',v_data; END IF;
 v_data:=public.apsyntra_role_user_management_snapshot(v_workspace);
 IF v_data->>'adminVerified'<>'true' OR v_data->>'bootstrapVerified'<>'false'
 THEN RAISE EXCEPTION 'User role snapshot identity contract incorrect: %',v_data; END IF;
 v_data:=public.apsyntra_crm_platform_role_snapshot(v_workspace);
 IF v_data->>'adminVerified'<>'true' OR v_data->>'bootstrapVerified'<>'false'
 THEN RAISE EXCEPTION 'CRM platform snapshot identity contract incorrect: %',v_data; END IF;

 -- Team Directory remains independently bootstrap-only and returns a narrow shape.
 BEGIN
  PERFORM public.timetracker_team_directory_snapshot(v_workspace);
  RAISE EXCEPTION 'CRM Admin incorrectly received bootstrap-only Team Directory';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 IF private.frt_has_role(v_workspace,'GENERAL_MANAGER') THEN
  RAISE EXCEPTION 'CRM Admin was incorrectly elevated into FRT finance workflow authority'; END IF;
 IF private.tool_traceability_is_admin(v_workspace) THEN
  RAISE EXCEPTION 'CRM Admin was incorrectly elevated into Tool Traceability workflow authority'; END IF;

 -- Inherited admin_general_manager identity is not a bootstrap target lock.
 IF NOT public.is_platform_admin(v_inherited) OR
    EXISTS(SELECT 1 FROM public.apsyntra_role_bootstrap_identities b WHERE b.user_id=v_inherited)
 THEN RAISE EXCEPTION 'Synthetic inherited-admin fixture invalid'; END IF;
 v_data:=public.apsyntra_crm_platform_role_set(v_workspace,v_inherited,'viewer',NULL);
 IF v_data->>'effectiveRole'<>'viewer' THEN
  RAISE EXCEPTION 'Non-bootstrap inherited admin remains locked from CRM role assignment: %',v_data; END IF;
 PERFORM public.apsyntra_role_manage_user_access(v_workspace,v_inherited,
  'module','time-tracker','Employee',true,NULL);
 IF NOT EXISTS(SELECT 1 FROM public.module_role_assignments
   WHERE user_id=v_inherited AND module_id='time-tracker' AND role='Employee' AND enabled)
 THEN RAISE EXCEPTION 'CRM Admin could not manage application role for non-bootstrap inherited admin'; END IF;

 -- Delegated FRT and Tool Traceability role setters inherit only the central
 -- CRM Admin role-management gate; their operational role helpers remain unchanged.
 PERFORM public.apsyntra_role_manage_user_access(v_workspace,v_inherited,
  'module','fund-released-tracker','GENERAL_MANAGER',true,NULL);
 IF NOT EXISTS(SELECT 1 FROM public.module_role_assignments
   WHERE user_id=v_inherited AND module_id='fund-released-tracker' AND role='GENERAL_MANAGER' AND enabled)
 THEN RAISE EXCEPTION 'CRM Admin could not assign FRT role through central administration'; END IF;
 PERFORM public.apsyntra_role_manage_user_access(v_workspace,v_inherited,
  'module','tool-traceability','ADMIN',true,NULL);
 IF NOT EXISTS(SELECT 1 FROM public.tool_traceability_memberships
   WHERE workspace_id=v_workspace AND user_id=v_inherited AND role='ADMIN' AND enabled AND status='active')
 THEN RAISE EXCEPTION 'CRM Admin could not assign Tool Traceability role through central administration'; END IF;

 -- Exact designated bootstrap accounts remain protected from role changes.
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_set(v_workspace,v_protected,'employee',NULL);
  RAISE EXCEPTION 'Protected bootstrap CRM role changed';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(v_workspace,v_protected,
   'module','time-tracker','Employee',true,NULL);
  RAISE EXCEPTION 'Protected bootstrap module role changed';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  PERFORM public.frt_admin_set_role(v_workspace,v_protected,'REQUESTOR');
  RAISE EXCEPTION 'Protected bootstrap FRT role changed';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  PERFORM public.tool_traceability_admin_set_role(v_workspace,v_protected,'USER',true);
  RAISE EXCEPTION 'Protected Tool Traceability bootstrap identity demoted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

 -- Self, foreign-workspace and non-admin targets remain denied.
 BEGIN
  PERFORM public.apsyntra_crm_platform_role_set(v_workspace,v_admin,'viewer',NULL);
  RAISE EXCEPTION 'CRM Admin self-target unexpectedly allowed';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(v_workspace,v_foreign,
   'module','time-tracker','Employee',true,NULL);
  RAISE EXCEPTION 'Foreign workspace target unexpectedly allowed';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',v_employee::text,true);
 IF public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'Employee acquired CRM Admin'; END IF;
 BEGIN
  PERFORM public.apsyntra_role_require_scope(v_workspace);
  RAISE EXCEPTION 'Employee passed CRM Admin scope';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

 -- Remove the explicit test override to verify inherited admin classification independently.
 DELETE FROM public.apsyntra_crm_platform_roles WHERE workspace_id=v_workspace AND user_id=v_inherited;
 -- The non-bootstrap inherited admin has effective CRM Admin, but not bootstrap.
 PERFORM set_config('request.jwt.claim.sub',v_inherited::text,true);
 IF public.apsyntra_role_is_bootstrap() OR NOT public.apsyntra_role_is_admin()
 THEN RAISE EXCEPTION 'Inherited CRM Admin classification mismatch'; END IF;

 -- Workspace switch, role revocation, membership revocation and anonymous caller fail closed.
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
 PERFORM set_config('app.workspace_id',v_foreign_workspace::text,true);
 IF public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'CRM Admin leaked to foreign workspace'; END IF;
 BEGIN
  PERFORM public.apsyntra_role_require_scope(v_foreign_workspace);
  RAISE EXCEPTION 'Foreign workspace CRM Admin scope accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('app.workspace_id',v_workspace::text,true);
 DELETE FROM public.apsyntra_crm_platform_roles WHERE workspace_id=v_workspace AND user_id=v_admin;
 IF public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'Revoked CRM Admin role remains active'; END IF;
 INSERT INTO public.apsyntra_crm_platform_roles(workspace_id,user_id,role)
 VALUES(v_workspace,v_admin,'admin');
 UPDATE public.workspace_members SET active=false WHERE workspace_id=v_workspace AND user_id=v_admin;
 IF public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'Inactive member remains CRM Admin'; END IF;
 UPDATE public.workspace_members SET active=true WHERE workspace_id=v_workspace AND user_id=v_admin;
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF public.apsyntra_role_is_admin() THEN RAISE EXCEPTION 'Anonymous caller is CRM Admin'; END IF;
 BEGIN
  PERFORM public.apsyntra_role_require_scope(v_workspace);
  RAISE EXCEPTION 'Anonymous caller passed CRM Admin scope';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

 -- The designated bootstrap identity retains its separate Team Directory capability.
 PERFORM set_config('request.jwt.claim.sub',v_bootstrap::text,true);
 IF NOT public.apsyntra_role_is_bootstrap() OR NOT public.apsyntra_role_is_admin()
 THEN RAISE EXCEPTION 'Bootstrap identity lost its normal CRM Admin authority'; END IF;
 v_data:=public.timetracker_team_directory_snapshot(v_workspace);
 IF v_data->>'bootstrapVerified'<>'true' OR v_data ? 'proposals' OR v_data ? 'audit'
 THEN RAISE EXCEPTION 'Bootstrap Team Directory contract leaked or mismatched: %',v_data; END IF;

 RAISE NOTICE 'CP-URM-04B PASS: CRM Admin parity, exact bootstrap protection, FRT/TT assignment paths, Team Directory isolation, revocation and non-admin denial';
END;
$verify$;
ROLLBACK;
