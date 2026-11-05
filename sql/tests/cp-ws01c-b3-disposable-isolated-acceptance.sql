-- CP-WS-01C/B3 — isolated, transactional workspace creation acceptance.
-- DISPOSABLE PostgreSQL 17 ONLY; creates synthetic records then ROLLS BACK.
-- Must run after staging B3 and before staging B4. Never run on production.
\set ON_ERROR_STOP on

DO $preflight$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
 OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
 OR has_function_privilege('authenticated','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR (SELECT creation_enabled OR selection_enabled
      FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
 OR (SELECT count(*) FROM public.workspaces)<>2
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT count(*) FROM private.ws01_events)<>0
 THEN RAISE EXCEPTION 'B3 test requires default-deny B3-only disposable fixture'
  USING ERRCODE='42501';
 END IF;
END $preflight$;

BEGIN;
-- Grant only within the rolled-back disposable transaction; flag remains off.
GRANT EXECUTE ON FUNCTION public.wm_ws01_create(text,text,uuid) TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',false);
DO $off$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_create('Disabled Attempt','closed',
   '11111111-1111-4111-8111-111111111101');
  RAISE EXCEPTION 'Disabled flag permitted creation' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $off$;
RESET ROLE;
DO $off_counts$
BEGIN
 IF (SELECT count(*) FROM public.workspaces)<>2
 OR (SELECT count(*) FROM private.ws01_create_requests)<>0
 OR (SELECT count(*) FROM private.ws01_events)<>0
 THEN RAISE EXCEPTION 'Denied B3 attempt wrote records'; END IF;
END $off_counts$;

UPDATE private.ws01_lifecycle_flags SET creation_enabled=true WHERE id IS TRUE;
SET ROLE authenticated;
DO $create$
DECLARE receipt jsonb; repeat_receipt jsonb;
BEGIN
 receipt:=public.wm_ws01_create('  Engineering Pilot  ','closed',
  '11111111-1111-4111-8111-111111111102');
 IF receipt->>'relation'<>'owner'
 OR receipt->>'privacy'<>'closed'
 OR receipt->>'idempotent'<>'false'
 OR receipt->>'active'<>'false'
 OR receipt->>'schemaVersion'<>'1'
 OR (receipt->>'workspaceId')::uuid IS NULL
 THEN RAISE EXCEPTION 'Invalid atomic creation receipt'; END IF;

 repeat_receipt:=public.wm_ws01_create('Engineering Pilot','closed',
  '11111111-1111-4111-8111-111111111102');
 IF repeat_receipt->>'idempotent'<>'true'
 OR repeat_receipt->>'workspaceId'<>receipt->>'workspaceId'
 THEN RAISE EXCEPTION 'Idempotent replay created different workspace'; END IF;

 BEGIN
  PERFORM public.wm_ws01_create('Wrong Replay','closed',
   '11111111-1111-4111-8111-111111111102');
  RAISE EXCEPTION 'Conflicting idempotent replay allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;

 BEGIN
  PERFORM public.wm_ws01_create('<script>','closed',
   '11111111-1111-4111-8111-111111111103');
  RAISE EXCEPTION 'Markup-like name accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_create('X','closed',
   '11111111-1111-4111-8111-111111111104');
  RAISE EXCEPTION 'Too-short name accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_create('Valid Name','public',
   '11111111-1111-4111-8111-111111111105');
  RAISE EXCEPTION 'Unsupported privacy accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_create('Valid Name','closed',NULL);
  RAISE EXCEPTION 'Missing idempotency identifier accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Creation silently switched workspace'; END IF;
END $create$;
RESET ROLE;

-- Separate statement to see committed-in-transaction writes from STABLE discovery.
DO $atomic$
DECLARE new_ws uuid;
BEGIN
 SELECT workspace_id INTO STRICT new_ws
 FROM private.ws01_create_requests
 WHERE actor_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
 AND request_id='11111111-1111-4111-8111-111111111102'::uuid;
 IF (SELECT count(*) FROM public.workspaces)<>3
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>6
 OR (SELECT count(*) FROM public.workspace_members
      WHERE workspace_id=new_ws AND user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND active)<>1
 OR (SELECT count(*) FROM private.ws01_workspace_policy
      WHERE workspace_id=new_ws AND privacy='closed')<>1
 OR (SELECT count(*) FROM private.ws01_member_roles
      WHERE workspace_id=new_ws AND relation='owner'
        AND user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>1
 OR (SELECT count(*) FROM private.ws01_create_requests)<>1
 OR (SELECT count(*) FROM private.ws01_events
      WHERE workspace_id=new_ws AND action='workspace.created'
        AND actor_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        AND session_id='aaaaaaaa-0000-4000-8000-000000000001')<>1
 OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
 OR (SELECT selection_enabled FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
 THEN RAISE EXCEPTION 'B3 atomic creation, audit or B4 isolation invariant failed'; END IF;
END $atomic$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',false);
DO $foreign$
DECLARE c jsonb;
BEGIN
 c:=public.wm_ws01_list();
 IF jsonb_array_length(c->'rows')<>1 OR
  c#>>'{rows,0,id}'<>'00000000-0000-4000-8000-000000000002'
 THEN RAISE EXCEPTION 'B3 leaked created workspace to foreign actor'; END IF;
END $foreign$;
RESET ROLE;

-- Restore all synthetic write attempts, grants and flags atomically.
ROLLBACK;

DO $rollback$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR (SELECT count(*) FROM public.workspaces)<>2
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT count(*) FROM private.ws01_workspace_policy)<>0
 OR (SELECT count(*) FROM private.ws01_member_roles)<>0
 OR (SELECT count(*) FROM private.ws01_create_requests)<>0
 OR (SELECT count(*) FROM private.ws01_events)<>0
 OR has_function_privilege('authenticated','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR (SELECT creation_enabled OR selection_enabled
      FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
 OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'B3 disposable rollback or default-deny was not preserved'; END IF;
 RAISE NOTICE 'CP-WS-01C/B3 isolated creation, denial, audit and rollback PASS';
END $rollback$;
