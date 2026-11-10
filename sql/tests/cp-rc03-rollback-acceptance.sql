DO $$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000001';
 target uuid:='11111111-1111-4111-8111-111111111111';
 workspace uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 result jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('app.workspace_id',workspace::text,true);
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(
   workspace,target,'module','material-request-hub','REQUESTOR',true,NULL);
  RAISE EXCEPTION 'Rolled-back CP-RC02 global MRH role unexpectedly accepted multi-workspace target';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 result:=public.apsyntra_role_user_management_snapshot(workspace);
 IF result ? 'roleManagementContract' THEN
  RAISE EXCEPTION 'Rollback left CP-RC03 snapshot marker active'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'users') x
   WHERE x->>'id'=target::text AND x ? 'activeWorkspaceCount') THEN
  RAISE EXCEPTION 'Rollback left CP-RC03 workspace-count field active'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.material_request_hub_memberships
   WHERE workspace_id=workspace AND user_id=target AND role='APPROVER'
     AND enabled=false AND status='disabled') THEN
  RAISE EXCEPTION 'Rollback altered existing MRH domain membership'; END IF;
 RAISE NOTICE 'CP_RC03_ROLLBACK_RESTORES_CP_RC02_DENIAL_PASS';
END $$;
