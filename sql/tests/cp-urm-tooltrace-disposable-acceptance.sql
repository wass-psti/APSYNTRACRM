\set ON_ERROR_STOP on
-- Actual migration SQL, no real credentials or production writes.
INSERT INTO public.workspace_members VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222',true);
DO $$
DECLARE r jsonb; stamp timestamptz; d jsonb; snapshot jsonb;
BEGIN
 PERFORM set_config('test.actor','11111111-1111-4111-8111-111111111111',true);
 r:=public.apsyntra_role_tooltrace_workspace_set(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222','LOGISTICS',true,NULL);
 IF r->>'role'<>'LOGISTICS' OR r->>'enabled'<>'true' THEN
  RAISE EXCEPTION 'assignment failed: %',r; END IF;
 stamp:=(r->>'updatedAt')::timestamptz;
 snapshot:=public.apsyntra_role_tooltrace_workspace_snapshot(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF snapshot->>'contract'<>'cp-urm-tooltrace-workspace-v1' OR
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'assignments') a
   WHERE a->>'userId'='22222222-2222-4222-8222-222222222222'
    AND a->>'role'='LOGISTICS' AND a->>'enabled'='true') THEN
  RAISE EXCEPTION 'workspace readback failed: %',snapshot; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'assignments') a
   WHERE a->>'userId'='33333333-3333-4333-8333-333333333333') THEN
  RAISE EXCEPTION 'foreign workspace account leaked'; END IF;
 -- Stale update rejected; no mutation.
 BEGIN
  PERFORM public.apsyntra_role_tooltrace_workspace_set(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '22222222-2222-4222-8222-222222222222','ADMIN',true,NULL);
  RAISE EXCEPTION 'stale update unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 r:=public.apsyntra_role_tooltrace_workspace_set(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222','ADMIN',true,stamp);
 stamp:=(r->>'updatedAt')::timestamptz;
 -- Preserve existing last active ADMIN in the domain.
 BEGIN
  PERFORM public.apsyntra_role_tooltrace_workspace_set(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '22222222-2222-4222-8222-222222222222','VIEWER',true,stamp);
  RAISE EXCEPTION 'last domain admin unexpectedly demoted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 -- Another active ADMIN permits normal edit and revoke.
 INSERT INTO public.tool_traceability_memberships
  (workspace_id,user_id,role,enabled,status)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111','ADMIN',true,'active');
 r:=public.apsyntra_role_tooltrace_workspace_set(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222','VIEWER',true,stamp);
 r:=public.apsyntra_role_tooltrace_workspace_set(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222','VIEWER',false,
  (r->>'updatedAt')::timestamptz);
 IF r->>'enabled'<>'false' THEN RAISE EXCEPTION 'revoke failed'; END IF;
 IF (SELECT count(*) FROM public.tool_traceability_activity
  WHERE actor_user_id='11111111-1111-4111-8111-111111111111'
   AND entity_type='membership' AND event_type='role_configured')<>4 THEN
  RAISE EXCEPTION 'audit events missing'; END IF;
 -- Self and foreign workspace assignments remain unavailable.
 BEGIN
  PERFORM public.apsyntra_role_tooltrace_workspace_set(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111','USER',true,NULL);
  RAISE EXCEPTION 'self assignment allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.apsyntra_role_tooltrace_workspace_set(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '33333333-3333-4333-8333-333333333333','USER',true,NULL);
  RAISE EXCEPTION 'foreign workspace assignment allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('test.actor','22222222-2222-4222-8222-222222222222',true);
 BEGIN
  PERFORM public.apsyntra_role_tooltrace_workspace_snapshot(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  RAISE EXCEPTION 'unauthorized snapshot allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT 'CP_URM_TOOLTRACE_DISPOSABLE_PASS' AS result;
