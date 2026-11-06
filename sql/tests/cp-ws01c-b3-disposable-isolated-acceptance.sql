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

-- CP-WS-02C: ordinary verified members may create, irrespective of platform role.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('request.jwt.claim.session_id',
 'bbbbbbbb-0000-4000-8000-000000000001',false);
DO $nonadmin_create$
DECLARE r jsonb;
BEGIN
 r:=public.wm_ws01_create('Independent HR Workspace','open',
  '22222222-2222-4222-8222-222222222201');
 IF r->>'relation'<>'owner' OR r->>'privacy'<>'open'
  OR r->>'active'<>'false' OR r->>'idempotent'<>'false'
 THEN RAISE EXCEPTION 'Signed nonadmin workspace create denied or wrong receipt'; END IF;
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000002'::uuid
 THEN RAISE EXCEPTION 'Nonadmin creation switched the current workspace'; END IF;
END $nonadmin_create$;
RESET ROLE;
DO $nonadmin_scope$
DECLARE workspace uuid;
BEGIN
 IF (SELECT platform_role FROM public.profiles
     WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>'employee'
 THEN RAISE EXCEPTION 'Workspace owner received global administrator privileges'; END IF;
 SELECT workspace_id INTO STRICT workspace
 FROM private.ws01_create_requests
 WHERE actor_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid;
 IF (SELECT count(*) FROM public.workspaces)<>4
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>7
 OR (SELECT count(*) FROM private.ws01_member_roles
     WHERE user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      AND workspace_id=workspace AND relation='owner')<>1
 OR (SELECT count(*) FROM private.ws01_events
     WHERE actor_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      AND workspace_id=workspace AND action='workspace.created')<>1
 THEN RAISE EXCEPTION 'Nonadmin ownership, audit or isolation invariant failed'; END IF;
END $nonadmin_scope$;

-- Signed but unverified or anonymous users must fail even if they are members.
UPDATE auth.users SET email_confirmed_at=NULL
 WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT set_config('request.jwt.claim.session_id',
 'dddddddd-0000-4000-8000-000000000001',false);
DO $unverified$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_create('Denied Unverified','closed',
   '33333333-3333-4333-8333-333333333301');
  RAISE EXCEPTION 'Unverified email granted owner role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $unverified$;
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now(),is_anonymous=true
 WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;
DO $anonymous$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_create('Denied Anonymous','closed',
   '33333333-3333-4333-8333-333333333302');
  RAISE EXCEPTION 'Anonymous identity granted owner role' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $anonymous$;
RESET ROLE;
DO $denied_counts$
BEGIN
 IF (SELECT count(*) FROM public.workspaces)<>4
 OR (SELECT count(*) FROM private.ws01_create_requests)<>2
 OR (SELECT count(*) FROM private.ws01_events)<>2
 THEN RAISE EXCEPTION 'Unverified or anonymous account created unauthorized workspace'; END IF;
END $denied_counts$;

-- Final B3 denial checks: exercise the *creation* RPC itself, not only B2 reads.
-- All synthetic identities, session mutations and grants exist inside ROLLBACK.
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
 ('a3a3a3a3-0000-4000-8000-000000000902',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '1 minute'),
 ('a3a3a3a3-0000-4000-8000-000000000903',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL);
DELETE FROM auth.sessions
 WHERE id='a3a3a3a3-0000-4000-8000-000000000903';
INSERT INTO auth.users(id) VALUES('ffffffff-ffff-4fff-8fff-ffffffffffff');
INSERT INTO public.profiles(id,status) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','active');
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
 ('ffffffff-0000-4000-8000-000000000001',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',NULL);
DO $isolated_nonmember$
BEGIN
 IF EXISTS (SELECT 1 FROM public.workspace_members
    WHERE user_id='ffffffff-ffff-4fff-8fff-ffffffffffff')
 THEN RAISE EXCEPTION 'Synthetic nonmember unexpectedly has workspace access'; END IF;
END $isolated_nonmember$;

-- Anonymous lacks EXECUTE even when the server-side creation flag is on.
SET ROLE anon;
DO $no_anon_create$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_create('Anonymous Denied','closed',
   '44444444-4444-4444-8444-444444444401');
  RAISE EXCEPTION 'Anonymous caller created a workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $no_anon_create$;
RESET ROLE;

-- An authenticated database role is insufficient without a matching live
-- verified actor, unexpired session and active workspace membership.
SET ROLE authenticated;
DO $signed_negative_contexts$
BEGIN
 PERFORM pg_catalog.set_config('request.jwt.claim.sub','',false);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
   'aaaaaaaa-0000-4000-8000-000000000001',false);
 BEGIN
  PERFORM public.wm_ws01_create('Missing Actor Denied','closed',
   '44444444-4444-4444-8444-444444444402');
  RAISE EXCEPTION 'Missing actor created a workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id','',false);
 BEGIN
  PERFORM public.wm_ws01_create('Missing Session Denied','closed',
   '44444444-4444-4444-8444-444444444403');
  RAISE EXCEPTION 'Missing session created a workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
   'bbbbbbbb-0000-4000-8000-000000000001',false);
 BEGIN
  PERFORM public.wm_ws01_create('Borrowed Session Denied','closed',
   '44444444-4444-4444-8444-444444444404');
  RAISE EXCEPTION 'Cross-identity session created a workspace'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
   'not-a-valid-session-uuid',false);
 BEGIN
  PERFORM public.wm_ws01_create('Malformed Session Denied','closed',
   '44444444-4444-4444-8444-444444444405');
  RAISE EXCEPTION 'Malformed session created a workspace'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
   'a3a3a3a3-0000-4000-8000-000000000902',false);
 BEGIN
  PERFORM public.wm_ws01_create('Expired Session Denied','closed',
   '44444444-4444-4444-8444-444444444406');
  RAISE EXCEPTION 'Expired session created a workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
   'a3a3a3a3-0000-4000-8000-000000000903',false);
 BEGIN
  PERFORM public.wm_ws01_create('Revoked Session Denied','closed',
   '44444444-4444-4444-8444-444444444407');
  RAISE EXCEPTION 'Revoked session created a workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
   'ffffffff-ffff-4fff-8fff-ffffffffffff',false);
 PERFORM pg_catalog.set_config('request.jwt.claim.session_id',
   'ffffffff-0000-4000-8000-000000000001',false);
 BEGIN
  PERFORM public.wm_ws01_create('Nonmember Denied','closed',
   '44444444-4444-4444-8444-444444444408');
  RAISE EXCEPTION 'Nonmember created a workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $signed_negative_contexts$;
RESET ROLE;

-- A still-signed actor loses creation authority when its profile or its
-- workspace memberships are disabled. Restore fixtures before further cases.
UPDATE public.profiles SET status='disabled'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',false);
DO $inactive_profile$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_create('Inactive Profile Denied','closed',
   '44444444-4444-4444-8444-444444444409');
  RAISE EXCEPTION 'Inactive profile created workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $inactive_profile$;
RESET ROLE;
UPDATE public.profiles SET status='active'
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

UPDATE public.workspace_members SET active=false
 WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE authenticated;
DO $revoked_memberships$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_create('Revoked Membership Denied','closed',
   '44444444-4444-4444-8444-444444444410');
  RAISE EXCEPTION 'Revoked member created workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $revoked_memberships$;
RESET ROLE;
UPDATE public.workspace_members SET active=true
 WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Even an exact replay must not bypass a disabled creation feature gate.
UPDATE private.ws01_lifecycle_flags SET creation_enabled=false WHERE id IS TRUE;
SET ROLE authenticated;
DO $disabled_replay$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_create('Engineering Pilot','closed',
   '11111111-1111-4111-8111-111111111102');
  RAISE EXCEPTION 'Disabled gate permitted creation replay'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $disabled_replay$;
RESET ROLE;
UPDATE private.ws01_lifecycle_flags SET creation_enabled=true WHERE id IS TRUE;

DO $final_negative_integrity$
BEGIN
 IF (SELECT count(*) FROM public.workspaces)<>4
 OR (SELECT count(*) FROM public.workspace_members WHERE active)<>7
 OR (SELECT count(*) FROM private.ws01_create_requests)<>2
 OR (SELECT count(*) FROM private.ws01_events WHERE action='workspace.created')<>2
 OR (SELECT count(*) FROM private.ws01_member_roles WHERE relation='owner')<>2
 OR (SELECT status FROM public.profiles
     WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')<>'active'
 OR (SELECT count(*) FROM private.ws01_lifecycle_flags
     WHERE id IS TRUE AND creation_enabled IS TRUE
      AND selection_enabled IS FALSE)<>1
 OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'B3 negative cases modified workspace data or authority'; END IF;
 RAISE NOTICE 'CP_WS01C_B3_FINAL_SIGNED_NEGATIVE_DISPOSABLE_PASS';
END $final_negative_integrity$;

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
