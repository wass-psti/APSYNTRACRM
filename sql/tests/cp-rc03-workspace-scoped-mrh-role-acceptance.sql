DO $$
DECLARE
 actor uuid:='00000000-0000-4000-8000-000000000001';
 target uuid:='11111111-1111-4111-8111-111111111111';
 foreign_user uuid:='22222222-2222-4222-8222-222222222222';
 protected_user uuid:='33333333-3333-4333-8333-333333333333';
 ordinary uuid:='44444444-4444-4444-8444-444444444444';
 workspace uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 other_workspace uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 board uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 result jsonb; revision timestamptz;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('app.workspace_id',workspace::text,true);
 result:=public.apsyntra_role_manage_user_access(workspace,target,'module','material-request-hub','REQUESTOR',true,NULL);
 IF result->>'effective'<>'true' OR result->>'resourceId'<>'material-request-hub' THEN RAISE EXCEPTION 'MRH acknowledgement invalid'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.material_request_hub_memberships WHERE workspace_id=workspace AND user_id=target AND role='REQUESTOR' AND enabled AND status='active') THEN RAISE EXCEPTION 'Workspace MRH assignment missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.material_request_hub_memberships WHERE workspace_id=other_workspace AND user_id=target) THEN RAISE EXCEPTION 'MRH assignment leaked to other workspace'; END IF;
 IF EXISTS(SELECT 1 FROM public.module_role_assignments WHERE user_id=target AND module_id='material-request-hub') THEN RAISE EXCEPTION 'MRH assignment mirrored into global table'; END IF;
 IF (SELECT count(*) FROM public.apsyntra_role_change_requests)<>1 OR (SELECT count(*) FROM public.apsyntra_role_change_audit WHERE event='applied')<>1 THEN RAISE EXCEPTION 'Audit receipt missing'; END IF;
 SELECT updated_at INTO revision FROM public.material_request_hub_memberships WHERE workspace_id=workspace AND user_id=target;
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(workspace,target,'module','material-request-hub','APPROVER',true,'2000-01-01T00:00:00Z');
  RAISE EXCEPTION 'Stale revision unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 IF (SELECT role FROM public.material_request_hub_memberships WHERE workspace_id=workspace AND user_id=target)<>'REQUESTOR' THEN RAISE EXCEPTION 'Stale mutation changed role'; END IF;
 result:=public.apsyntra_role_manage_user_access(workspace,target,'module','material-request-hub','APPROVER',true,revision);
 IF result->'after'->>'role'<>'APPROVER' THEN RAISE EXCEPTION 'MRH update failed'; END IF;
 SELECT updated_at INTO revision FROM public.material_request_hub_memberships WHERE workspace_id=workspace AND user_id=target;
 result:=public.apsyntra_role_manage_user_access(workspace,target,'module','material-request-hub','APPROVER',false,revision);
 IF NOT EXISTS(SELECT 1 FROM public.material_request_hub_memberships WHERE workspace_id=workspace AND user_id=target AND NOT enabled AND status='disabled') THEN RAISE EXCEPTION 'MRH revoke failed'; END IF;
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(workspace,target,'module','time-tracker','Employee',true,NULL);
  RAISE EXCEPTION 'Global role unexpectedly allowed for multi-workspace user';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 result:=public.apsyntra_role_manage_user_access(workspace,target,'board',board::text,'viewer',true,NULL);
 IF NOT EXISTS(SELECT 1 FROM public.work_board_members WHERE board_id=board AND user_id=target AND role='viewer') THEN RAISE EXCEPTION 'Scoped board access failed'; END IF;
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(workspace,actor,'module','material-request-hub','ADMIN',true,NULL);
  RAISE EXCEPTION 'Self assignment succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(workspace,protected_user,'module','material-request-hub','REQUESTOR',true,NULL);
  RAISE EXCEPTION 'Protected admin target succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(workspace,foreign_user,'module','material-request-hub','REQUESTOR',true,NULL);
  RAISE EXCEPTION 'Foreign target succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(other_workspace,target,'module','material-request-hub','REQUESTOR',true,NULL);
  RAISE EXCEPTION 'Foreign workspace context succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',ordinary::text,true);
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(workspace,target,'module','material-request-hub','REQUESTOR',true,NULL);
  RAISE EXCEPTION 'Non-bootstrap actor succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 result:=public.apsyntra_role_user_management_snapshot(workspace);
 IF result->>'roleManagementContract'<>'cp-rc03-workspace-scoped-mrh-v1' THEN RAISE EXCEPTION 'Snapshot contract marker missing'; END IF;
 IF (SELECT (x->>'activeWorkspaceCount')::integer FROM jsonb_array_elements(result->'users') x WHERE x->>'id'=target::text)<>2 THEN RAISE EXCEPTION 'Workspace count incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'moduleAssignments') x WHERE x->>'userId'=target::text AND x->>'moduleId'='material-request-hub' AND x->>'role'='APPROVER' AND x->>'enabled'='false') THEN RAISE EXCEPTION 'Snapshot MRH state missing'; END IF;
 IF (SELECT count(*) FROM public.apsyntra_role_change_requests)<>4 OR (SELECT count(*) FROM public.apsyntra_role_change_audit WHERE event='applied')<>4 THEN RAISE EXCEPTION 'MRH audit counts invalid'; END IF;
 RAISE NOTICE 'CP_RC03_WORKSPACE_SCOPED_MRH_ROLE_ACCEPTANCE_PASS';
END $$;
