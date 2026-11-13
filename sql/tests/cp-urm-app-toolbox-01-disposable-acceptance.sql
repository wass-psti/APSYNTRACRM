DO $seed$
DECLARE
 w1 uuid:='11111111-1111-4111-8111-111111111111';
 w2 uuid:='22222222-2222-4222-8222-222222222222';
 actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 target uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 protected_target uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 shadow_revision timestamptz;
BEGIN
 INSERT INTO public.profiles(id,email) VALUES
  (actor,'crm-admin@example.invalid'),(target,'member@example.invalid'),
  (protected_target,'protected@example.invalid');
 INSERT INTO public.workspace_members(workspace_id,user_id,active) VALUES
  (w1,actor,true),(w1,target,true),(w1,protected_target,true),(w2,target,true);
 INSERT INTO public.apsyntra_role_bootstrap_identities(user_id) VALUES(protected_target);
 -- Simulate the old global shadow row. The new source snapshot must not report it.
 INSERT INTO public.module_role_assignments(user_id,module_id,role,enabled)
 VALUES(target,'toolbox-issues','employee',true);
 INSERT INTO cp_toolbox_shadow_baseline(user_id,updated_at)
 SELECT user_id,updated_at FROM public.module_role_assignments
 WHERE user_id=target AND module_id='toolbox-issues';
 PERFORM set_config('request.jwt.claim.sub',actor::text,false);
END
$seed$;

DO $assign$
DECLARE
 w1 uuid:='11111111-1111-4111-8111-111111111111';
 w2 uuid:='22222222-2222-4222-8222-222222222222';
 actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 target uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 protected_target uuid:='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 r jsonb;
 rev1 timestamptz;
 rev2 timestamptz;
 rev3 timestamptz;
 snapshot jsonb;
 source_role text;
 source_enabled boolean;
 source_workspace_count integer;
 activity_count integer;
 audit_count integer;
BEGIN
 r:=public.apsyntra_role_manage_user_access(
  w1,target,'module','toolbox-issues','supervisor',true,NULL);
 IF r->>'effective'<>'true' OR r->>'resourceId'<>'toolbox-issues'
   OR r->>'targetUserId'<>target::text THEN
  RAISE EXCEPTION 'Initial Toolbox assignment acknowledgement invalid: %',r;
 END IF;
 rev1:=(r->>'currentRevision')::timestamptz;
 SELECT role,enabled INTO source_role,source_enabled
 FROM public.toolbox_issues_memberships WHERE workspace_id=w1 AND user_id=target;
 IF source_role<>'supervisor' OR source_enabled IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Toolbox source membership was not created';
 END IF;
 SELECT count(*) INTO source_workspace_count FROM public.toolbox_issues_memberships
 WHERE user_id=target;
 IF source_workspace_count<>1 THEN
  RAISE EXCEPTION 'Toolbox assignment leaked outside requested workspace';
 END IF;
 IF (SELECT updated_at FROM public.module_role_assignments
      WHERE user_id=target AND module_id='toolbox-issues') IS DISTINCT FROM
    (SELECT updated_at FROM cp_toolbox_shadow_baseline WHERE user_id=target) THEN
  RAISE EXCEPTION 'Global shadow role unexpectedly changed';
 END IF;
 IF (SELECT role FROM public.module_role_assignments
      WHERE user_id=target AND module_id='toolbox-issues')<>'employee' THEN
  RAISE EXCEPTION 'Global shadow row was modified instead of source membership';
 END IF;

 snapshot:=public.apsyntra_role_user_management_snapshot(w1);
 IF (SELECT count(*) FROM jsonb_array_elements(snapshot->'moduleAssignments') x
     WHERE x->>'moduleId'='toolbox-issues' AND x->>'userId'=target::text)<>1
 THEN RAISE EXCEPTION 'Snapshot did not expose exactly one source Toolbox membership'; END IF;
 IF (SELECT x->>'role' FROM jsonb_array_elements(snapshot->'moduleAssignments') x
     WHERE x->>'moduleId'='toolbox-issues' AND x->>'userId'=target::text)<>'supervisor'
 THEN RAISE EXCEPTION 'Snapshot returned the stale global shadow role'; END IF;

 r:=public.apsyntra_role_manage_user_access(
  w1,target,'module','toolbox-issues','viewer',true,rev1);
 rev2:=(r->>'currentRevision')::timestamptz;
 IF (SELECT role FROM public.toolbox_issues_memberships
     WHERE workspace_id=w1 AND user_id=target)<>'viewer' THEN
  RAISE EXCEPTION 'Toolbox role modification failed';
 END IF;

 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(
   w1,target,'module','toolbox-issues','employee',true,rev1);
  RAISE EXCEPTION 'Stale Toolbox revision unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;

 r:=public.apsyntra_role_manage_user_access(
  w1,target,'module','toolbox-issues','viewer',false,rev2);
 rev3:=(r->>'currentRevision')::timestamptz;
 SELECT role,enabled INTO source_role,source_enabled
 FROM public.toolbox_issues_memberships WHERE workspace_id=w1 AND user_id=target;
 IF source_role<>'viewer' OR source_enabled IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Toolbox revocation did not disable the source membership';
 END IF;
 snapshot:=public.apsyntra_role_user_management_snapshot(w1);
 IF (SELECT x->>'enabled' FROM jsonb_array_elements(snapshot->'moduleAssignments') x
     WHERE x->>'moduleId'='toolbox-issues' AND x->>'userId'=target::text)<>'false'
 THEN RAISE EXCEPTION 'Disabled Toolbox source membership disappeared from snapshot'; END IF;

 r:=public.apsyntra_role_manage_user_access(
  w1,target,'module','toolbox-issues','employee',true,rev3);
 IF (SELECT role FROM public.toolbox_issues_memberships
     WHERE workspace_id=w1 AND user_id=target)<>'employee'
 OR (SELECT enabled FROM public.toolbox_issues_memberships
     WHERE workspace_id=w1 AND user_id=target) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Re-enabling a disabled Toolbox membership failed'; END IF;

 SELECT count(*) INTO activity_count FROM public.toolbox_issues_activity
 WHERE workspace_id=w1 AND entity_id=target::text
   AND event_type IN ('role_changed','role_revoked');
 IF activity_count<>4 THEN
  RAISE EXCEPTION 'Expected 4 immutable Toolbox membership activity events, got %',activity_count;
 END IF;
 SELECT count(*) INTO audit_count FROM public.apsyntra_role_change_audit
 WHERE workspace_id=w1 AND actor_id=actor AND event='applied';
 IF audit_count<>4 THEN
  RAISE EXCEPTION 'Expected 4 central applied audit events, got %',audit_count;
 END IF;

 -- Workspace-scoped Toolbox roles remain assignable to multi-workspace members.
 PERFORM public.apsyntra_role_manage_user_access(
  w1,target,'module','toolbox-issues','supervisor',true,
  (SELECT updated_at FROM public.toolbox_issues_memberships
   WHERE workspace_id=w1 AND user_id=target));
 -- Other globally keyed application roles retain their existing multi-workspace denial.
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(
   w1,target,'module','time-tracker','Employee',true,NULL);
  RAISE EXCEPTION 'Global application role unexpectedly allowed for multi-workspace target';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 -- CRM admins cannot assign their own role or modify exact protected bootstrap targets.
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(
   w1,actor,'module','toolbox-issues','admin',true,NULL);
  RAISE EXCEPTION 'Self-assignment unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(
   w1,protected_target,'module','toolbox-issues','admin',true,NULL);
  RAISE EXCEPTION 'Protected bootstrap target unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 -- Actor cannot choose another workspace even though target is a member there.
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(
   w2,target,'module','toolbox-issues','viewer',true,NULL);
  RAISE EXCEPTION 'Cross-workspace scope unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 -- Only the source table's current role vocabulary is accepted.
 BEGIN
  PERFORM public.apsyntra_role_manage_user_access(
   w1,target,'module','toolbox-issues','team_leader',true,
   (SELECT updated_at FROM public.toolbox_issues_memberships
    WHERE workspace_id=w1 AND user_id=target));
  RAISE EXCEPTION 'Legacy Toolbox role unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 RAISE NOTICE 'PASS: Toolbox source assignment, modify, revoke, re-enable, CAS, scoped snapshot, audit, and denials';
END
$assign$;
