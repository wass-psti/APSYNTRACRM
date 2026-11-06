-- CP-WS-01 configuration acceptance: synthetic users and disposable PG17 only.
-- The staging RPC has no client grant and is disabled outside this transaction.
-- No real users, workspaces, permissions or provider email operations.
\set ON_ERROR_STOP on
DO $preflight$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR current_setting('server_version_num')::integer < 170000
  OR to_regprocedure('public.wm_ws01_config_read(uuid)') IS NULL
  OR to_regprocedure('public.wm_ws01_config_update(uuid,text,text,bigint)') IS NULL
  OR to_regclass('private.ws01_config_revisions') IS NULL
  OR (SELECT enabled FROM private.ws01_config_flags WHERE id IS TRUE)
  OR has_function_privilege('authenticated','public.wm_ws01_config_read(uuid)','EXECUTE')
  OR has_function_privilege('authenticated','public.wm_ws01_config_update(uuid,text,text,bigint)','EXECUTE')
  OR has_function_privilege('anon','public.wm_ws01_config_update(uuid,text,text,bigint)','EXECUTE')
  OR has_table_privilege('authenticated','private.ws01_config_events','SELECT')
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='private.ws01_config_events'::regclass)
 THEN RAISE EXCEPTION 'Configuration candidate not dormant or missing RLS'
  USING ERRCODE='42501'; END IF;
 RAISE NOTICE 'CP_WS01_CONFIG_DEFAULT_DENY_SCHEMA_PASS';
END $preflight$;

-- Prior disposable lifecycle acceptance can create additional synthetic rows.
-- Capture the real initial membership count for a no-mutation invariant.
SELECT pg_catalog.set_config('cp_ws01_config.prior_members',
 (SELECT count(*)::text FROM public.workspace_members WHERE active),false);
BEGIN;
-- Use only synthetic existing fixture accounts. No roles/permissions persist.
INSERT INTO private.ws01_workspace_policy(workspace_id,privacy,created_by)
VALUES('00000000-0000-4000-8000-000000000001','closed',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
ON CONFLICT(workspace_id) DO NOTHING;
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
VALUES('00000000-0000-4000-8000-000000000001',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner')
ON CONFLICT(workspace_id,user_id) DO UPDATE SET relation='owner';
GRANT EXECUTE ON FUNCTION public.wm_ws01_config_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wm_ws01_config_update(uuid,text,text,bigint) TO authenticated;

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',true);
DO $flag_off$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.wm_ws01_config_read('00000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Read succeeded while config flag off'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_update(
   '00000000-0000-4000-8000-000000000001','Updated','open',1);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Write succeeded while config flag off'; END IF;
END $flag_off$;
RESET ROLE;
UPDATE private.ws01_config_flags SET enabled=true WHERE id IS TRUE;
SET ROLE authenticated;
DO $owner_ok$
DECLARE readback jsonb; no_op jsonb; result jsonb; stale boolean:=false;
BEGIN
 readback:=public.wm_ws01_config_read('00000000-0000-4000-8000-000000000001');
 IF readback->>'name'<>'Main Workspace' OR readback->>'privacy'<>'closed'
  OR readback->>'revision'<>'1' OR readback->>'canEdit'<>'true'
 THEN RAISE EXCEPTION 'Initial signed owner config read incorrect'; END IF;
 no_op:=public.wm_ws01_config_update(
  '00000000-0000-4000-8000-000000000001','Main Workspace','closed',1);
 IF no_op->>'updated'<>'false' OR no_op->>'revision'<>'1'
 THEN RAISE EXCEPTION 'No-op changed config revision'; END IF;
 result:=public.wm_ws01_config_update(
  '00000000-0000-4000-8000-000000000001',' Engineering Operations ','open',1);
 IF result->>'schemaVersion'<>'1' OR result->>'name'<>'Engineering Operations'
  OR result->>'privacy'<>'open' OR result->>'revision'<>'2'
  OR result->>'updated'<>'true'
 THEN RAISE EXCEPTION 'Authorized configuration CAS failed'; END IF;
 readback:=public.wm_ws01_config_read('00000000-0000-4000-8000-000000000001');
 IF readback->>'revision'<>'2' OR readback->>'name'<>'Engineering Operations'
 THEN RAISE EXCEPTION 'Updated configuration read did not persist in fixture'; END IF;
 BEGIN
  PERFORM public.wm_ws01_config_update(
   '00000000-0000-4000-8000-000000000001','Lost Update','closed',1);
 EXCEPTION WHEN serialization_failure THEN stale:=true; END;
 IF NOT stale THEN RAISE EXCEPTION 'Stale owner revision was not denied'; END IF;
 no_op:=public.wm_ws01_config_update(
  '00000000-0000-4000-8000-000000000001','Engineering Operations','open',2);
 IF no_op->>'updated'<>'false' OR no_op->>'revision'<>'2'
 THEN RAISE EXCEPTION 'Idempotent same-state update changed revision'; END IF;
END $owner_ok$;
DO $owner_invalid$
DECLARE denied boolean;
BEGIN
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_update(
   '00000000-0000-4000-8000-000000000001','<script>','open',2);
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Unsafe HTML workspace name accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_update(
   '00000000-0000-4000-8000-000000000001','Good','public',2);
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Unsupported privacy accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_read('00000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Owner read foreign workspace'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_update(
   '00000000-0000-4000-8000-000000000002','Foreign Update','closed',1);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Owner changed foreign workspace'; END IF;
END $owner_invalid$;
RESET ROLE;

-- A member can view their own workspace metadata, but cannot rename it.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000001',true);
DO $nonowner$
DECLARE readback jsonb; denied boolean:=false;
BEGIN
 readback:=public.wm_ws01_config_read('00000000-0000-4000-8000-000000000001');
 IF readback->>'canEdit'<>'false' THEN
  RAISE EXCEPTION 'Member received owner edit permission'; END IF;
 BEGIN
  PERFORM public.wm_ws01_config_update(
    '00000000-0000-4000-8000-000000000001','Member Update','closed',2);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Member changed owner-only settings'; END IF;
END $nonowner$;
-- Owner of the OTHER workspace is not entitled to view or update primary.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.wm_ws01_config_read('00000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Foreign user read workspace configuration'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_update(
   '00000000-0000-4000-8000-000000000001','Foreign Update','closed',2);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Foreign user wrote workspace configuration'; END IF;
END $foreign$;

-- Expired, borrowed and unsigned GoTrue sessions never access config data.
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',true);
DO $borrowed$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.wm_ws01_config_read('00000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Borrowed session read succeeded'; END IF;
END $borrowed$;
RESET ROLE;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',true);
DO $expired$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.wm_ws01_config_read('00000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Expired session read succeeded'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_update(
    '00000000-0000-4000-8000-000000000001','Revoked','closed',2);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Expired session wrote config'; END IF;
END $expired$;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','',true);
DO $unsigned$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.wm_ws01_config_read('00000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Unsigned session read configuration'; END IF;
END $unsigned$;
RESET ROLE;

DO $integrity$
BEGIN
 IF (SELECT name FROM public.workspaces
     WHERE id='00000000-0000-4000-8000-000000000001')<>'Engineering Operations'
  OR (SELECT privacy FROM private.ws01_workspace_policy
     WHERE workspace_id='00000000-0000-4000-8000-000000000001')<>'open'
  OR (SELECT revision FROM private.ws01_config_revisions
     WHERE workspace_id='00000000-0000-4000-8000-000000000001')<>2
  OR (SELECT count(*) FROM private.ws01_config_events
     WHERE workspace_id='00000000-0000-4000-8000-000000000001')<>1
  OR (SELECT previous_name FROM private.ws01_config_events LIMIT 1)<>'Main Workspace'
  OR (SELECT next_name FROM private.ws01_config_events LIMIT 1)<>'Engineering Operations'
  OR (SELECT previous_privacy FROM private.ws01_config_events LIMIT 1)<>'closed'
  OR (SELECT next_privacy FROM private.ws01_config_events LIMIT 1)<>'open'
  OR (SELECT count(*) FROM public.workspace_members WHERE active) <>
   current_setting('cp_ws01_config.prior_members')::bigint
  OR has_function_privilege('anon','public.wm_ws01_config_update(uuid,text,text,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'Owner CAS or private audit integrity failed'; END IF;
 RAISE NOTICE 'CP_WS01_CONFIG_OWNER_CAS_FOREIGN_SESSION_AUDIT_DISPOSABLE_PASS';
END $integrity$;
ROLLBACK;

DO $rollback$
BEGIN
 IF (SELECT name FROM public.workspaces
     WHERE id='00000000-0000-4000-8000-000000000001')<>'Main Workspace'
  OR (SELECT count(*) FROM private.ws01_config_events)<>0
  OR (SELECT count(*) FROM private.ws01_config_revisions)<>0
  OR (SELECT enabled FROM private.ws01_config_flags WHERE id)
  OR has_function_privilege('authenticated','public.wm_ws01_config_update(uuid,text,text,bigint)','EXECUTE')
  OR has_function_privilege('authenticated','public.wm_ws01_config_read(uuid)','EXECUTE')
  OR (SELECT not_after FROM auth.sessions
     WHERE id='aaaaaaaa-0000-4000-8000-000000000001') IS NOT NULL
 THEN RAISE EXCEPTION 'Configuration test did not roll back safely'; END IF;
 RAISE NOTICE 'CP_WS01_CONFIG_DEFAULT_DENY_ROLLBACK_PASS';
END $rollback$;
