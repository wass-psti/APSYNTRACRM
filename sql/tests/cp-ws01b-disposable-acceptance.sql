-- CP-WS-01B full isolated signed-claim lifecycle acceptance; never use prod.
\set ON_ERROR_STOP on
-- Only in disposable CI do we enable staged grants and flags.
UPDATE private.ws01_lifecycle_flags SET creation_enabled=true WHERE id;
GRANT EXECUTE ON FUNCTION public.wm_ws01_create(text,text,uuid) TO authenticated;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',false);
DO $owner_create$
DECLARE
 result jsonb;
 replay jsonb;
 workspace uuid;
BEGIN
 result:=public.wm_ws01_create('Engineering', 'open',
  '11111111-1111-4111-8111-111111111111');
 workspace:=(result->>'workspaceId')::uuid;
 IF result->>'relation'<>'owner' OR result->>'privacy'<>'open'
  OR result->>'idempotent'<>'false' OR result->>'active'<>'false'
 THEN RAISE EXCEPTION 'Owner create receipt invalid'; END IF;
 replay:=public.wm_ws01_create('Engineering', 'open',
  '11111111-1111-4111-8111-111111111111');
 IF replay->>'idempotent'<>'true' OR replay->>'workspaceId'<>workspace::text
 THEN RAISE EXCEPTION 'Idempotent create repeated a workspace'; END IF;
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
   '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Creation unexpectedly switched the current workspace'; END IF;
 BEGIN
  PERFORM public.wm_ws01_create('Different Workspace', 'open',
   '11111111-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'Changed idempotency key payload allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_create('<script>', 'closed',
   '11111111-1111-4111-8111-111111111112');
  RAISE EXCEPTION 'HTML-like unsafe name accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_create('Valid', 'public',
   '11111111-1111-4111-8111-111111111113');
  RAISE EXCEPTION 'Unknown privacy value accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 RAISE NOTICE 'CP-WS-01B owner/create/retry/privacy/invalid denial PASS';
END $owner_create$;

-- New statement: STABLE signed discovery must observe the committed
-- result of the previous creation statement, not a DO-block snapshot.
DO $owner_discovery$
DECLARE catalog jsonb;
BEGIN
 catalog:=public.wm_ws01_list();
 IF jsonb_array_length(catalog->'rows')<>2
  OR NOT EXISTS(
   SELECT 1 FROM pg_catalog.jsonb_array_elements(catalog->'rows') x
   WHERE x->>'relation'='owner'
    AND x->>'name'='Engineering'
    AND x->>'privacy'='open' AND x->>'active'='false')
 THEN RAISE EXCEPTION 'Signed owner discovery after creation failed'; END IF;
 RAISE NOTICE 'CP-WS-01B committed owner is discoverable PASS';
END $owner_discovery$;

-- Genuine foreign-account fixture still sees only its membership,
-- even when the owner created an OPEN workspace.
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',false);
DO $foreign$
DECLARE catalog jsonb;
BEGIN
 catalog:=public.wm_ws01_list();
 IF jsonb_array_length(catalog->'rows')<>1
  OR catalog#>>'{rows,0,id}'<>'00000000-0000-4000-8000-000000000002'
  OR catalog#>>'{rows,0,privacy}'<>'closed'
 THEN RAISE EXCEPTION 'Foreign user saw unjoined workspace'; END IF;
 RAISE NOTICE 'CP-WS-01B open privacy did not leak another workspace PASS';
END $foreign$;

RESET ROLE;
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation) VALUES
 ('00000000-0000-4000-8000-000000000002',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','collaborator');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000001',false);
DO $member$
DECLARE catalog jsonb;
BEGIN
 catalog:=public.wm_ws01_list();
 IF jsonb_array_length(catalog->'rows')<>2
  OR NOT EXISTS(
   SELECT 1 FROM pg_catalog.jsonb_array_elements(catalog->'rows') x
   WHERE x->>'id'='00000000-0000-4000-8000-000000000002'
     AND x->>'relation'='collaborator')
 THEN RAISE EXCEPTION 'Scoped collaborator discovery failed'; END IF;
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Cutover activated before approval'; END IF;
 RAISE NOTICE 'CP-WS-01B signed member/collaborator discovery PASS';
END $member$;

-- A separate high-risk cutover is tested only after explicit disposable enable.
RESET ROLE;
UPDATE private.ws01_lifecycle_flags SET selection_enabled=true WHERE id;
GRANT EXECUTE ON FUNCTION public.wm_ws01_select(uuid,uuid) TO authenticated;
SET ROLE authenticated;
DO $session_switch$
DECLARE receipt jsonb;
BEGIN
 receipt:=public.wm_ws01_select(
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001');
 IF receipt->>'switched'<>'true'
  OR receipt->>'workspaceId'<>'00000000-0000-4000-8000-000000000002'
 THEN RAISE EXCEPTION 'Workspace switch receipt invalid'; END IF;
END $session_switch$;

-- New statement, with a new snapshot: the authority and every board reader
-- must now project the selected workspace instead of the primary workspace.
DO $session_scope$
BEGIN
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
   '00000000-0000-4000-8000-000000000002'::uuid
  OR public.ws01_fixture_visible_boards()::text NOT LIKE '%Foreign%'
 THEN RAISE EXCEPTION 'Signed session switch failed to scope domain projection'; END IF;
 IF public.ws01_fixture_visible_boards()::text LIKE '%Main%'
 THEN RAISE EXCEPTION 'Old workspace board leaked after switch'; END IF;
 BEGIN
  PERFORM public.wm_ws01_select(
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'Stale expected workspace accepted' USING ERRCODE='P9999';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 RAISE NOTICE 'CP-WS-01B signed switch + board isolation + stale CAS PASS';
END $session_scope$;

-- Same user, different authenticated session remains in initial workspace.
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000002',false);
DO $second_session$
BEGIN
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000001'::uuid
  OR public.ws01_fixture_visible_boards()::text NOT LIKE '%Main%'
  OR public.ws01_fixture_visible_boards()::text LIKE '%Foreign%'
 THEN RAISE EXCEPTION 'Other GoTrue session workspace changed'; END IF;
 RAISE NOTICE 'CP-WS-01B independent concurrent sessions PASS';
END $second_session$;

-- Signed foreign-only account cannot select primary.
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',false);
DO $deny_foreign$
BEGIN
 BEGIN
  PERFORM public.wm_ws01_select(
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'Foreign-account workspace switch allowed' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'CP-WS-01B foreign workspace switch denied PASS';
END $deny_foreign$;

-- True session revocation cascades session-choice removal and disallows RPC.
RESET ROLE;
DELETE FROM auth.sessions WHERE id='cccccccc-0000-4000-8000-000000000001';
DO $after_revocation$
BEGIN
 IF EXISTS(SELECT 1 FROM private.ws01_session_choices
  WHERE session_id='cccccccc-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'Revoked GoTrue session retained active selection'; END IF;
END $after_revocation$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000001',false);
DO $revoked$
BEGIN
 IF public.current_workspace_id(auth.uid()) IS NOT NULL
   OR public.ws01_fixture_visible_boards() IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'Revoked session retained current workspace or board access'; END IF;
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'Revoked session could discover workspaces' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_select(
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'Revoked session could select workspace' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $revoked$;
RESET ROLE;

-- Membership revocation erases a live session selection; restoring a member
-- must NOT resurrect the old workspace choice.
INSERT INTO auth.sessions(id,user_id) VALUES(
 'cccccccc-0000-4000-8000-000000000003',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',false);
SELECT public.wm_ws01_select(
 '00000000-0000-4000-8000-000000000002',
 '00000000-0000-4000-8000-000000000001');
RESET ROLE;
UPDATE public.workspace_members SET active=false
 WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  AND workspace_id='00000000-0000-4000-8000-000000000002';
DO $membership_revoke$
BEGIN
 IF EXISTS(SELECT 1 FROM private.ws01_session_choices
  WHERE session_id='cccccccc-0000-4000-8000-000000000003')
 THEN RAISE EXCEPTION 'Membership revocation did not prune session choice'; END IF;
END $membership_revoke$;
UPDATE public.workspace_members SET active=true
 WHERE user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  AND workspace_id='00000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
DO $restore$
BEGIN
 IF public.current_workspace_id(auth.uid()) IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Reactivated member recovered stale session choice'; END IF;
 RAISE NOTICE 'CP-WS-01B membership revocation and reactivation safety PASS';
END $restore$;
RESET ROLE;

-- Expire a second session without reusing its tokens.
UPDATE auth.sessions SET not_after=now()-interval '2 minutes'
 WHERE id='cccccccc-0000-4000-8000-000000000002';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000002',false);
DO $expired$
BEGIN
 IF public.current_workspace_id(auth.uid()) IS NOT NULL
  OR public.ws01_fixture_visible_boards() IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'Expired session retained workspace or board access'; END IF;
 BEGIN
  PERFORM public.wm_ws01_list();
  RAISE EXCEPTION 'Expired session could discover' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_ws01_create('Expired Session','closed',
   'aaaaaaaa-1111-4111-8111-111111111111');
  RAISE EXCEPTION 'Expired session could create' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'CP-WS-01B expired GoTrue session denied PASS';
END $expired$;
RESET ROLE;

-- Verify no direct privilege leaks, one idempotent create and immutable audit.
DO $final$
BEGIN
 IF (SELECT count(*) FROM public.workspaces)<>3
  OR (SELECT count(*) FROM private.ws01_create_requests)<>1
  OR (SELECT count(*) FROM private.ws01_events WHERE action='workspace.created')<>1
  OR (SELECT count(*) FROM private.ws01_events WHERE action='workspace.selected')<>2
  OR has_table_privilege('authenticated','private.ws01_member_roles','SELECT')
  OR has_table_privilege('authenticated','public.workspaces','SELECT')
  OR has_function_privilege('anon','public.wm_ws01_create(text,text,uuid)','EXECUTE')
  OR has_function_privilege('anon','public.wm_ws01_select(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'CP-WS-01B isolation, retry, audit or grant invariant failed'; END IF;
 RAISE NOTICE 'CP-WS-01B all disposable acceptance gates PASS';
END $final$;
