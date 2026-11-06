-- CP-WS-01C/B3 controlled activation/rollback smoke in disposable PostgreSQL 17.
-- Must never be run against production. Does not persist any workspace records.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NULL
  OR (SELECT creation_enabled OR selection_enabled
      FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
  OR (SELECT count(*) FROM private.ws01_create_requests)<>0
  OR (SELECT count(*) FROM public.workspaces)<>2
 THEN RAISE EXCEPTION 'Disposable-only controlled activation fixture not pristine'
  USING ERRCODE='42501'; END IF;
END $pre$;

-- The real candidate activation must pass exact source/prerequisite/grant gates.
\i sql/cp-ws01c-b3-controlled-production-activation-candidate.sql
DO $active$
BEGIN
 IF NOT has_function_privilege('authenticated',
       'public.wm_ws01_create(text,text,uuid)','EXECUTE')
  OR has_function_privilege('anon',
       'public.wm_ws01_create(text,text,uuid)','EXECUTE')
  OR (SELECT count(*) FROM private.ws01_lifecycle_flags
      WHERE id IS TRUE AND creation_enabled IS TRUE
      AND selection_enabled IS FALSE)<>1
 THEN RAISE EXCEPTION 'Controlled activation did not enable minimal client entry point'
  USING ERRCODE='42501'; END IF;
END $active$;

-- Write within an isolated transaction; ROLLBACK guarantees no fixture records
-- survive the test. The approved creation function must still enforce real
-- signed-session checks and atomic owner membership and audit rows.
BEGIN;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',false);
DO $create$
DECLARE r jsonb;again jsonb;
BEGIN
 r:=public.wm_ws01_create('Acceptance Pilot','closed',
  '99999999-9999-4999-8999-999999999901');
 IF r->>'relation'<>'owner' OR r->>'privacy'<>'closed'
  OR r->>'active'<>'false' OR r->>'idempotent'<>'false'
  OR r->>'schemaVersion'<>'1'
 THEN RAISE EXCEPTION 'Controlled activation creation receipt wrong'; END IF;
 again:=public.wm_ws01_create('Acceptance Pilot','closed',
  '99999999-9999-4999-8999-999999999901');
 IF again->>'workspaceId'<>r->>'workspaceId' OR
  again->>'idempotent'<>'true'
 THEN RAISE EXCEPTION 'Idempotent replay was not stable'; END IF;
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Creation silently selected new workspace'; END IF;
END $create$;
RESET ROLE;
DO $atomic$
BEGIN
 IF (SELECT count(*) FROM public.workspaces)<>3
 OR (SELECT count(*) FROM private.ws01_create_requests)<>1
 OR (SELECT count(*) FROM private.ws01_events
      WHERE action='workspace.created')<>1
 OR (SELECT count(*) FROM private.ws01_member_roles
      WHERE relation='owner')<>1
 THEN RAISE EXCEPTION 'Creation atomic/audit invariants violated'; END IF;
END $atomic$;
ROLLBACK;

-- Do NOT preserve live created rows from disposable test.
DO $clean$
BEGIN
 IF (SELECT count(*) FROM public.workspaces)<>2
 OR (SELECT count(*) FROM private.ws01_create_requests)<>0
 OR (SELECT count(*) FROM private.ws01_events)<>0
 THEN RAISE EXCEPTION 'Disposable test failed to roll back workspace creation'; END IF;
END $clean$;

-- Explicit rollback removes the authenticated grant and leaves the
-- internal RPC installed but unreachable to unprivileged clients.
\i sql/cp-ws01c-b3-controlled-production-disable-candidate.sql
DO $off$
BEGIN
 IF (SELECT creation_enabled OR selection_enabled
    FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
 OR has_function_privilege('authenticated',
      'public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.wm_ws01_create(text,text,uuid)','EXECUTE')
 OR (SELECT count(*) FROM public.workspaces)<>2
 THEN RAISE EXCEPTION 'Controlled rollback did not restore default-off boundary'
  USING ERRCODE='42501'; END IF;
END $off$;
\echo CP_WS01C_B3_CONTROLLED_DISPOSABLE_ACTIVATION_AND_ROLLBACK_PASS
