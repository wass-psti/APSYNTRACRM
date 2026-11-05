-- CP-WS-02D/B3 — independent module state and lock ceiling.
-- Real source functions, synthetic dependencies, disposable PG17 only.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR (SELECT enabled OR advanced_roles_enabled
     FROM private.ws02d_invitation_flags WHERE id)
 OR to_regprocedure('public.put_module_state(text,text,text,text,bigint)') IS NULL
 OR to_regprocedure('public.delete_module_state(text,text,text,bigint)') IS NULL
 OR to_regprocedure('public.acquire_module_operation_lock(text,text,integer)') IS NULL
 OR to_regprocedure('public.release_module_operation_lock(text,text,text)') IS NULL
 OR (SELECT count(*) FROM public.module_state_entries)<>0
 OR (SELECT count(*) FROM public.module_operation_locks)<>0
 OR (SELECT count(*) FROM private.ws02d_member_access)<>0
 THEN RAISE EXCEPTION 'WS02D/B3 module mutation fixture not isolated and dormant'
 USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TEMP TABLE ws02d_b3_baseline ON COMMIT PRESERVE ROWS AS
 SELECT (SELECT count(*) FROM public.module_state_entries) as states,
 (SELECT count(*) FROM public.module_operation_locks) as locks,
 (SELECT count(*) FROM private.ws02d_member_access) as roles,
 (SELECT count(*) FROM public.workspace_members WHERE active) as active_members;
BEGIN;
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $member_state$
DECLARE r jsonb;ok boolean; tok text;
BEGIN
 r:=public.put_module_state('fueltrack-plus','project.plan','original','shared',0);
 IF (r->>'revision')::bigint<>1 THEN RAISE EXCEPTION 'Initial write revision changed'; END IF;
 r:=public.put_module_state('fueltrack-plus','project.plan','modified','shared',1);
 IF (r->>'revision')::bigint<>2
  OR (SELECT value FROM public.module_state_entries
    WHERE module_id='fueltrack-plus' AND state_key='project.plan'
      AND workspace_id='00000000-0000-4000-8000-000000000001')<>'modified'
 THEN RAISE EXCEPTION 'Member module state update altered'; END IF;
 BEGIN
  PERFORM public.put_module_state('fueltrack-plus','project.plan',
    'stale','shared',1);
  RAISE EXCEPTION 'Stale revision accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.put_module_state('untrusted-module','project.plan',
    'disallowed','shared',0);
  RAISE EXCEPTION 'Domain-specific module ACL bypassed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 tok:=public.acquire_module_operation_lock('fueltrack-plus','fueltrack:test:b3',30);
 IF tok IS NULL OR length(tok)<>48
  OR (SELECT count(*) FROM public.module_operation_locks l
      WHERE l.workspace_id='00000000-0000-4000-8000-000000000001'
        AND l.owner_user_id=auth.uid())<>1
 THEN RAISE EXCEPTION 'Member operation lock acquisition failed'; END IF;
 IF NOT public.release_module_operation_lock('fueltrack-plus','fueltrack:test:b3',tok)
  OR public.release_module_operation_lock('fueltrack-plus','fueltrack:test:b3',tok)
 THEN RAISE EXCEPTION 'Member operation lock release or replay incorrect'; END IF;
 ok:=public.delete_module_state('fueltrack-plus','project.plan','shared',2);
 IF NOT ok OR public.delete_module_state('fueltrack-plus','project.plan','shared',0)
 THEN RAISE EXCEPTION 'Member state deletion/replay changed'; END IF;
END $member_state$;

-- Synthetic legacy preexisting Viewer lock and state: enforce denial on
-- release/delete too, not just new inserts. No real data is touched.
INSERT INTO public.module_state_entries(workspace_id,module_id,state_key,
 scope,owner_key,value,revision,updated_by)
VALUES('00000000-0000-4000-8000-000000000001',
 'fueltrack-plus','project.plan','shared','*','preserve',1,
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
INSERT INTO public.module_operation_locks(workspace_id,module_id,lock_key,
 token,owner_user_id,expires_at,created_at)
VALUES('00000000-0000-4000-8000-000000000001','fueltrack-plus',
 'viewer:historic','fixture-viewer-token',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '1 hour',now());
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $viewer_default_off$
BEGIN
 BEGIN
  PERFORM public.put_module_state('fueltrack-plus','project.plan','viewer','shared',1);
  RAISE EXCEPTION 'Default-off Viewer wrote state' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.delete_module_state('fueltrack-plus','project.plan','shared',1);
  RAISE EXCEPTION 'Default-off Viewer deleted state' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.acquire_module_operation_lock('fueltrack-plus','viewer:lock',30);
  RAISE EXCEPTION 'Default-off Viewer acquired lock' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.release_module_operation_lock('fueltrack-plus',
   'viewer:historic','fixture-viewer-token');
  RAISE EXCEPTION 'Default-off Viewer released lock' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $viewer_default_off$;
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
DO $viewer_advanced_on$
BEGIN
 IF NOT private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',auth.uid(),'view')
 OR private.ws02d_workspace_ceiling(
  '00000000-0000-4000-8000-000000000001',auth.uid(),'edit')
 THEN RAISE EXCEPTION 'Viewer role ceiling contract inconsistent'; END IF;
 BEGIN
  PERFORM public.put_module_state('fueltrack-plus','project.plan','viewer','shared',1);
  RAISE EXCEPTION 'Viewer wrote after advanced role enabled' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.delete_module_state('fueltrack-plus','project.plan','shared',1);
  RAISE EXCEPTION 'Viewer deleted after advanced role enabled' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.acquire_module_operation_lock('fueltrack-plus','viewer:lock',30);
  RAISE EXCEPTION 'Viewer acquired lock with read-only role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.release_module_operation_lock('fueltrack-plus',
   'viewer:historic','fixture-viewer-token');
  RAISE EXCEPTION 'Viewer released existing lock with read-only role'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT value FROM public.module_state_entries
   WHERE state_key='project.plan')<>'preserve'
 OR (SELECT count(*) FROM public.module_operation_locks
   WHERE lock_key='viewer:historic')<>1
 THEN RAISE EXCEPTION 'Viewer denial mutated protected data'; END IF;
END $viewer_advanced_on$;

-- Legacy foreign member remains confined to their own workspace.
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign_member$
DECLARE r jsonb;
BEGIN
 r:=public.put_module_state('fueltrack-plus','project.plan','foreign','shared',0);
 IF (SELECT count(*) FROM public.module_state_entries e
  WHERE e.workspace_id='00000000-0000-4000-8000-000000000002'
  AND e.value='foreign')<>1
 OR (SELECT value FROM public.module_state_entries e
  WHERE e.workspace_id='00000000-0000-4000-8000-000000000001')<>'preserve'
 THEN RAISE EXCEPTION 'Foreign workspace module state isolation failed'; END IF;
END $foreign_member$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
DO $expired_session$
BEGIN
 BEGIN
  PERFORM public.put_module_state('fueltrack-plus','project.plan','expired','shared',1);
  RAISE EXCEPTION 'Expired session wrote module state' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.acquire_module_operation_lock('fueltrack-plus','expired:lock',30);
  RAISE EXCEPTION 'Expired session acquired operation lock' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $expired_session$;

ROLLBACK;
DO $check_rollback$
DECLARE b record;
BEGIN
 SELECT * INTO STRICT b FROM pg_temp.ws02d_b3_baseline;
 IF (SELECT count(*) FROM public.module_state_entries)<>b.states
 OR (SELECT count(*) FROM public.module_operation_locks)<>b.locks
 OR (SELECT count(*) FROM private.ws02d_member_access)<>b.roles
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>b.active_members
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'WS02D/B3 core module mutations did not roll back'; END IF;
 RAISE NOTICE 'CP-WS-02D/B3 module state/lock edit ceiling PASS';
END $check_rollback$;
DROP TABLE pg_temp.ws02d_b3_baseline;
