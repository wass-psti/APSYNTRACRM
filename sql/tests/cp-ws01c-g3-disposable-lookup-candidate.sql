-- CP-WS-01C/B3 Phase G3 — disposable-only, experimental authorization guard.
-- This is NOT a production migration or approved drop-in replacement.
-- Source-bearing SECURITY DEFINER/INVOKER callers require independent
-- compatibility review before any activation. Do not export fixture identities.
\set ON_ERROR_STOP on

DO $g3_environment$
BEGIN
 IF current_database() <> 'workspace_disposable'
 OR current_setting('server_version_num')::integer < 170000
 OR (SELECT count(*) FROM public.workspaces) <> 2
 OR (SELECT count(*) FROM public.workspace_members WHERE active) <> 5
 OR to_regprocedure('public.wm_ws01_list()') IS NULL
 THEN RAISE EXCEPTION 'Phase G3 candidate requires isolated PG17 B2 fixture'
   USING ERRCODE='42501'; END IF;
END $g3_environment$;

-- Prior B2 acceptance deliberately adds nonproduction Auth/session fixtures.
-- Snapshot the actual pre-G3 count instead of assuming setup-only state.
SELECT pg_catalog.set_config('cp_ws01c_g3.prior_sessions',
 (SELECT count(*)::text FROM auth.sessions),false);

BEGIN;
-- Model separation between a caller-bound exported API and a private
-- explicitly-authorized internal lookup. No production grants are changed.
CREATE FUNCTION private.ws01_g3_internal_workspace_lookup(p_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $internal$
 SELECT m.workspace_id
 FROM public.workspace_members m
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=p_user_id AND m.active IS TRUE AND p.status='active'
 ORDER BY m.created_at ASC LIMIT 1;
$internal$;
REVOKE ALL ON FUNCTION private.ws01_g3_internal_workspace_lookup(uuid)
 FROM PUBLIC,anon,authenticated;

-- Hypothetical client-facing replacement. Never activate globally until
-- internal delegated-caller compatibility is independently accepted.
CREATE OR REPLACE FUNCTION public.current_workspace_id(
 p_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $guarded$
DECLARE actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR p_user_id IS DISTINCT FROM actor
 OR NOT private.wm_board_config_session_active()
 THEN
  RAISE EXCEPTION 'Signed workspace lookup denied' USING ERRCODE='42501';
 END IF;
 RETURN private.ws01_g3_internal_workspace_lookup(actor);
END $guarded$;
REVOKE ALL ON FUNCTION public.current_workspace_id(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.current_workspace_id(uuid)
 TO authenticated;

DO $private_source_scope$
BEGIN
 IF has_function_privilege('authenticated',
   'private.ws01_g3_internal_workspace_lookup(uuid)','EXECUTE')
 OR has_function_privilege('anon',
   'private.ws01_g3_internal_workspace_lookup(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
   'public.current_workspace_id(uuid)','EXECUTE')
 OR has_function_privilege('anon',
   'public.current_workspace_id(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'G3 split exported unexpected grants'; END IF;
 IF private.ws01_g3_internal_workspace_lookup(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000002'::uuid
 THEN RAISE EXCEPTION 'Private delegated lookup contract lost'; END IF;
END $private_source_scope$;

-- Legitimate existing synthetic actor sees the same own workspace,
-- signed B2 catalog and board-scope output.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',false);
DO $g3_owner_positive$
DECLARE catalog jsonb;boards jsonb;
BEGIN
 IF public.current_workspace_id() IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000001'::uuid
 OR public.current_workspace_id(auth.uid()) IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Valid current-user workspace lookup regressed'; END IF;
 catalog:=public.wm_ws01_list();
 IF catalog->>'userId' IS DISTINCT FROM auth.uid()::text
 OR jsonb_array_length(catalog->'rows')<>1
 OR (catalog->'rows'->0->>'id') IS DISTINCT FROM
   '00000000-0000-4000-8000-000000000001'
 THEN RAISE EXCEPTION 'Signed B2 member catalog regressed'; END IF;
 boards:=public.ws01_fixture_visible_boards();
 IF jsonb_array_length(boards)<>1
 OR boards->0->>'id' IS DISTINCT FROM
  '11111111-1111-4111-8111-111111111111'
 THEN RAISE EXCEPTION 'Signed own-board listing regressed'; END IF;
END $g3_owner_positive$;

DO $g3_foreign_denial$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.current_workspace_id(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN
  RAISE EXCEPTION 'G3 candidate exposed a foreign workspace'; END IF;
END $g3_foreign_denial$;

DO $g3_private_denial$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM private.ws01_g3_internal_workspace_lookup(
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN
  RAISE EXCEPTION 'Authenticated client accessed private lookup'; END IF;
END $g3_private_denial$;
RESET ROLE;

-- A second real *fixture* actor keeps its own workspace and is denied
-- when querying the first actor. Not a genuine live signed-browser test.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',false);
DO $g3_member_positive$
DECLARE denied boolean:=false;
BEGIN
 IF public.current_workspace_id() IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000002'::uuid
 THEN RAISE EXCEPTION 'Second member lost own workspace'; END IF;
 BEGIN
  PERFORM public.current_workspace_id(
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Second member read foreign scope'; END IF;
END $g3_member_positive$;
RESET ROLE;

-- Expired/revoked disposable session attempts never disclose a scope.
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='aaaaaaaa-0000-4000-8000-000000000002';
DELETE FROM auth.sessions WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000002',false);
DO $g3_expired_denial$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.current_workspace_id();
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Expired session disclosed scope'; END IF;
END $g3_expired_denial$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',false);
DO $g3_revoked_denial$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.current_workspace_id();
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Revoked session disclosed scope'; END IF;
END $g3_revoked_denial$;

SELECT pg_catalog.set_config('request.jwt.claim.sub','',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id','',false);
DO $g3_unsigned_denial$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.current_workspace_id();
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Unsigned caller disclosed scope'; END IF;
END $g3_unsigned_denial$;
RESET ROLE;

SET ROLE anon;
DO $g3_anon_denial$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.current_workspace_id();
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'Anonymous caller invoked lookup'; END IF;
END $g3_anon_denial$;
RESET ROLE;

-- Guard and all synthetic expired/revoked changes are rolled back.
DO $g3_counts$
BEGIN
 IF (SELECT count(*) FROM public.workspaces)<>2
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT count(*) FROM public.work_boards)<>2
 THEN RAISE EXCEPTION 'G3 scope guard mutated workspace fixture'; END IF;
 RAISE NOTICE 'CP_WS01C_B3_G3_DISPOSABLE_GUARD_PREVIEW_PASS';
END $g3_counts$;
ROLLBACK;

DO $g3_rollback$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR to_regprocedure('private.ws01_g3_internal_workspace_lookup(uuid)') IS NOT NULL
 OR (SELECT count(*) FROM auth.sessions)<>
  current_setting('cp_ws01c_g3.prior_sessions')::integer
 OR (SELECT count(*) FROM public.workspaces)<>2
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
 OR (SELECT count(*) FROM public.work_boards)<>2
 OR (SELECT p.prolang FROM pg_proc p
  WHERE p.oid='public.current_workspace_id(uuid)'::regprocedure)
  <> (SELECT oid FROM pg_language WHERE lanname='sql')
 THEN RAISE EXCEPTION 'G3 disposable rollback failed'; END IF;
 RAISE NOTICE 'CP_WS01C_B3_G3_DISPOSABLE_ROLLBACK_PASS';
END $g3_rollback$;
