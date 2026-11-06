-- CP-WS-01C/B4 owner settings: isolated PostgreSQL acceptance only.
-- This entire acceptance rolls back its temporary grant, changes and audit.
\set ON_ERROR_STOP on
BEGIN;
DO $default_deny$
BEGIN
 IF to_regprocedure('public.wm_ws01_configure(uuid,text,text,text,text)') IS NULL
  OR has_function_privilege('authenticated',
    'public.wm_ws01_configure(uuid,text,text,text,text)','EXECUTE')
  OR has_function_privilege('anon',
    'public.wm_ws01_configure(uuid,text,text,text,text)','EXECUTE')
  OR has_table_privilege('authenticated','public.workspaces','UPDATE')
  OR has_table_privilege('authenticated','private.ws01_workspace_policy','UPDATE')
  OR has_table_privilege('authenticated','private.ws01_events','INSERT')
 THEN RAISE EXCEPTION 'Owner configuration staging exposed client write privileges'; END IF;
 IF (SELECT count(*) FROM private.ws01_events
   WHERE action='workspace.configured')<>0
 THEN RAISE EXCEPTION 'Unexpected configuration event before acceptance'; END IF;
END $default_deny$;

-- Grant applies only inside this ROLLBACK-only synthetic transaction.
GRANT EXECUTE ON FUNCTION public.wm_ws01_configure(uuid,text,text,text,text)
 TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',false);
DO $owner$
DECLARE
 v_workspace uuid;
 v_result jsonb;
BEGIN
 SELECT (item->>'id')::uuid INTO v_workspace
 FROM pg_catalog.jsonb_array_elements(public.wm_ws01_list()->'rows') item
 WHERE item->>'name'='Engineering' AND item->>'relation'='owner'
   AND item->>'privacy'='open' AND item->>'active'='false';
 IF v_workspace IS NULL THEN
  RAISE EXCEPTION 'Expected signed, created, nonactive owner workspace missing'; END IF;
 PERFORM pg_catalog.set_config('cpws01.owner_workspace',v_workspace::text,false);
 v_result:=public.wm_ws01_configure(
  v_workspace,' Engineering Ops ','closed','Engineering','open');
 IF v_result->>'schemaVersion'<>'1'
  OR v_result->>'workspaceId'<>v_workspace::text
  OR v_result->>'previousName'<>'Engineering'
  OR v_result->>'previousPrivacy'<>'open'
  OR v_result->>'name'<>'Engineering Ops'
  OR v_result->>'privacy'<>'closed'
  OR v_result->>'changed'<>'true'
 THEN RAISE EXCEPTION 'Owner configuration receipt or CAS failed'; END IF;
 v_result:=public.wm_ws01_configure(
  v_workspace,'Engineering Ops','closed','Engineering Ops','closed');
 IF v_result->>'changed'<>'false'
 THEN RAISE EXCEPTION 'Idempotent unchanged configuration reported mutation'; END IF;
 BEGIN
  PERFORM public.wm_ws01_configure(
   v_workspace,'Old Writer','open','Engineering','open');
  RAISE EXCEPTION 'Stale settings overwrite accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_configure(
   v_workspace,'<script>','open','Engineering Ops','closed');
  RAISE EXCEPTION 'Invalid name accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_configure(
   v_workspace,'Allowed Name','public','Engineering Ops','closed');
  RAISE EXCEPTION 'Invalid privacy accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $owner$;

-- Re-read signed catalog in a fresh SQL statement after configuration.
DO $discovery$
DECLARE v_catalog jsonb:=public.wm_ws01_list();
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_catalog.jsonb_array_elements(v_catalog->'rows') x
  WHERE x->>'id'=pg_catalog.current_setting('cpws01.owner_workspace')
    AND x->>'name'='Engineering Ops'
    AND x->>'privacy'='closed'
    AND x->>'relation'='owner'
    AND x->>'active'='false')
 THEN RAISE EXCEPTION 'Signed owner discovery missed persisted configuration'; END IF;
END $discovery$;

-- A valid foreign member does not gain configuration rights through an ID.
SELECT set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',false);
DO $foreign$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_configure(
   pg_catalog.current_setting('cpws01.owner_workspace')::uuid,
   'Foreign Edit','open','Engineering Ops','closed');
  RAISE EXCEPTION 'Foreign actor configured another workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_configure(
   '00000000-0000-4000-8000-000000000002',
   'Member Edit','closed','Foreign Workspace','closed');
  RAISE EXCEPTION 'Member configured workspace without owner relation' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign$;

-- Mismatched actor/session claims must not authorize a valid owner.
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $mismatch$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_configure(
   pg_catalog.current_setting('cpws01.owner_workspace')::uuid,
   'Forged Session','open','Engineering Ops','closed');
  RAISE EXCEPTION 'Mismatched session permitted owner update' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $mismatch$;

-- Expire the owner's actual session inside the disposable transaction.
RESET ROLE;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',false);
DO $expired$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_configure(
   pg_catalog.current_setting('cpws01.owner_workspace')::uuid,
   'Expired Edit','open','Engineering Ops','closed');
  RAISE EXCEPTION 'Expired session permitted configuration' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $expired$;
RESET ROLE;

DO $audit$
DECLARE v_id uuid:=pg_catalog.current_setting('cpws01.owner_workspace')::uuid;
BEGIN
 IF (SELECT w.name FROM public.workspaces w WHERE w.id=v_id)<>'Engineering Ops'
  OR (SELECT p.privacy FROM private.ws01_workspace_policy p
    WHERE p.workspace_id=v_id)<>'closed'
  OR (SELECT count(*) FROM private.ws01_events e
    WHERE e.workspace_id=v_id AND e.action='workspace.configured')<>1
  OR EXISTS(SELECT 1 FROM private.ws01_events e
    WHERE e.action='workspace.configured'
      AND (e.actor_id<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
       OR e.session_id<>'aaaaaaaa-0000-4000-8000-000000000001'::uuid))
  OR has_table_privilege('authenticated','private.ws01_events','SELECT')
 THEN RAISE EXCEPTION 'Owner configuration persistence, audit or RLS acceptance failed'; END IF;
 RAISE NOTICE 'CP-WS-01C/B4 owner-only configuration CAS, signed denial and audit PASS (rollback-only)';
END $audit$;
ROLLBACK;
