-- CP-WS-01C/B2: cross-identity and session-denial acceptance.
-- DISPOSABLE PostgreSQL 17 ONLY. Synthetic users and sessions, no live tokens.
-- Runs before B3/B4 are installed. Never execute against production.
\set ON_ERROR_STOP on

DO $disposable_guard$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('public.ws01_fixture_auth_diagnostics()') IS NULL
  OR to_regprocedure('public.wm_ws01_list()') IS NULL
  OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NOT NULL
  OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'B2 denial fixture requires isolated B2-only disposable database'
  USING ERRCODE='42501';
 END IF;
END $disposable_guard$;

-- Model the real platform-role field without making roles an authorization bypass.
-- Discovery is membership scoped, independently of platform role.
ALTER TABLE public.profiles ADD COLUMN platform_role text NOT NULL DEFAULT 'employee';
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $role_fixture$
BEGIN
 IF (SELECT platform_role FROM public.profiles
  WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'admin_general_manager'
 OR (SELECT platform_role FROM public.profiles
  WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>'employee'
 THEN RAISE EXCEPTION 'Synthetic manager/nonmanager fixture not established'; END IF;
END $role_fixture$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',false);
DO $manager$
DECLARE catalog jsonb;
BEGIN
 catalog:=public.wm_ws01_list();
 IF catalog->>'userId'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  OR jsonb_array_length(catalog->'rows')<>1
  OR catalog#>>'{rows,0,id}'<>'00000000-0000-4000-8000-000000000001'
  OR catalog#>>'{rows,0,active}'<>'true'
 THEN RAISE EXCEPTION 'Manager disclosure crossed workspace boundary'; END IF;
 RAISE NOTICE 'B2 synthetic manager: membership-only discovery PASS';
END $manager$;

-- A valid nonmanager in a different workspace cannot see manager membership.
SELECT set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',false);
DO $nonmanager$
DECLARE catalog jsonb;
BEGIN
 catalog:=public.wm_ws01_list();
 IF catalog->>'userId'<>'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  OR catalog->>'activeWorkspaceId'<>'00000000-0000-4000-8000-000000000002'
  OR jsonb_array_length(catalog->'rows')<>1
  OR catalog#>>'{rows,0,id}'<>'00000000-0000-4000-8000-000000000002'
  OR catalog#>>'{rows,0,privacy}'<>'closed'
 THEN RAISE EXCEPTION 'Nonmanager foreign workspace isolation failed'; END IF;
 RAISE NOTICE 'B2 synthetic nonmanager foreign isolation PASS';
END $nonmanager$;

-- A genuinely multi-member synthetic user sees both memberships, no more.
SELECT set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('request.jwt.claim.session_id',
 'cccccccc-0000-4000-8000-000000000001',false);
DO $multi$
DECLARE catalog jsonb;
BEGIN
 catalog:=public.wm_ws01_list();
 IF jsonb_array_length(catalog->'rows')<>2
  OR (SELECT count(DISTINCT x->>'id')
      FROM pg_catalog.jsonb_array_elements(catalog->'rows') x
      WHERE x->>'id' IN ('00000000-0000-4000-8000-000000000001',
                       '00000000-0000-4000-8000-000000000002'))<>2
  OR (SELECT count(*) FROM pg_catalog.jsonb_array_elements(catalog->'rows') x
      WHERE x->>'active'='true')<>1
 THEN RAISE EXCEPTION 'Multi-membership discovery contract failed'; END IF;
 RAISE NOTICE 'B2 synthetic multi-member scope PASS';
END $multi$;
RESET ROLE;

-- A real-looking synthetic signed session but NO membership must fail closed.
INSERT INTO auth.users(id) VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
INSERT INTO public.profiles(id,status) VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','active');
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
 ('eeeeeeee-0000-4000-8000-000000000001',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',NULL);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',false);
SELECT set_config('request.jwt.claim.session_id',
 'eeeeeeee-0000-4000-8000-000000000001',false);
DO $no_member$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'No-membership session received catalog' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'B2 no-membership signed denial PASS';
END $no_member$;

-- Caller/session mismatch cannot borrow another profile's valid GoTrue session.
SELECT set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',false);
DO $mismatch$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'Cross-identity session substitution allowed'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'B2 actor/session mismatch denied PASS';
END $mismatch$;

-- Empty session claim must be denied, even when actor has active membership.
SELECT set_config('request.jwt.claim.session_id','',false);
DO $no_session$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'No-session claim discovered workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'B2 missing-session claim denied PASS';
END $no_session$;
RESET ROLE;

-- Only disposable synthetic sessions are expired/revoked.
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
 ('dddddddd-0000-4000-8000-000000000002',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()-interval '1 minute'),
 ('dddddddd-0000-4000-8000-000000000003',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',NULL);
DELETE FROM auth.sessions
 WHERE id='dddddddd-0000-4000-8000-000000000003';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000002',false);
DO $expired$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'Expired session discovered workspaces' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'B2 expired-session denial PASS';
END $expired$;
SELECT set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000003',false);
DO $revoked$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'Revoked session discovered workspaces' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'B2 revoked-session denial PASS';
END $revoked$;
RESET ROLE;

-- Inactive profiles and revoked memberships must also fail even if signed.
UPDATE public.profiles SET status='disabled'
 WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000001',false);
DO $inactive$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'Inactive profile discovered workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'B2 inactive profile denied PASS';
END $inactive$;
RESET ROLE;
UPDATE public.profiles SET status='active'
 WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
UPDATE public.workspace_members SET active=false
 WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;
DO $membership_revoked$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'Revoked membership discovered workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'B2 inactive membership denied PASS';
END $membership_revoked$;
RESET ROLE;
UPDATE public.workspace_members SET active=true
 WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';

-- Unsigned/anon principal must lack EXECUTE even before RPC-level checks.
SET ROLE anon;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.session_id','',false);
DO $anon$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'Anonymous discovery execution allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'B2 anonymous discovery grant denied PASS';
END $anon$;
RESET ROLE;

DO $final$
BEGIN
 IF (SELECT count(*) FROM public.workspaces)<>2
  OR (SELECT count(*) FROM public.workspace_members WHERE active IS TRUE)<>5
  OR has_function_privilege('anon','public.wm_ws01_list()','EXECUTE')
  OR to_regprocedure('public.wm_ws01_create(text,text,uuid)') IS NOT NULL
  OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
  OR (SELECT creation_enabled OR selection_enabled
      FROM private.ws01_lifecycle_flags WHERE id IS TRUE)
 THEN RAISE EXCEPTION 'B2-only default-deny fixture invariants failed'; END IF;
 RAISE NOTICE 'CP-WS-01C/B2 disposable cross-identity and denial suite PASS';
END $final$;
