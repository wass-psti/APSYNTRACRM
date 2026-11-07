-- CP-WS-01 Lifecycle Phase H: cross-contract scope hardening acceptance.
-- Disposable PostgreSQL 17 only. No production migration or live users.
-- This isolates the actual STAGED B2/B3/B4 selection, WS01 configuration,
-- WS02 invitation and board-read RPCs under a caller-bound lookup preview.
-- It does not reproduce all 63 live dependent SQL function bodies.
\set ON_ERROR_STOP on

DO $h_preflight$
BEGIN
 IF current_database() <> 'workspace_disposable'
  OR current_setting('server_version_num')::integer < 170000
  OR to_regprocedure('public.wm_ws01_list()') IS NULL
  OR to_regprocedure('public.wm_ws01_select(uuid,uuid)') IS NULL
  OR to_regprocedure('public.wm_ws01_config_read(uuid)') IS NULL
  OR to_regprocedure('public.wm_ws01_config_update(uuid,text,text,bigint)') IS NULL
  OR to_regprocedure('private.ws02d_issue(uuid,text,text,uuid)') IS NULL
  OR to_regprocedure('private.ws01_signed_actor_session()') IS NULL
  OR to_regprocedure('public.ws01_fixture_visible_boards()') IS NULL
  OR NOT EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags
    WHERE id IS TRUE AND selection_enabled IS TRUE)
  OR EXISTS(SELECT 1 FROM private.ws01_config_flags
    WHERE id IS TRUE AND enabled IS TRUE)
  OR EXISTS(SELECT 1 FROM private.ws02d_invitation_flags
    WHERE id IS TRUE AND enabled IS TRUE)
  OR NOT EXISTS(SELECT 1 FROM auth.sessions
    WHERE id='cccccccc-0000-4000-8000-000000000003'::uuid
     AND user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid)
 THEN RAISE EXCEPTION 'H needs the completed disposable lifecycle acceptance fixture'
  USING ERRCODE='42501'; END IF;
END $h_preflight$;

SELECT pg_catalog.set_config('cp_ws01_h.prior_members',
 (SELECT count(*)::text FROM public.workspace_members WHERE active IS TRUE),false);
SELECT pg_catalog.set_config('cp_ws01_h.prior_events',
 (SELECT count(*)::text FROM private.ws01_events),false);
BEGIN;

-- Caller-bound security policy preview: it preserves the staged session-choice
-- behavior for the signed actor, and rejects direct lookup of any other UUID.
-- This is NOT a source-identical replay of the production 63-call graph.
CREATE OR REPLACE FUNCTION public.current_workspace_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $scope$
DECLARE
 v_actor uuid:=auth.uid();
 v_sid uuid;
 v_fallback uuid;
 v_chosen uuid;
BEGIN
 IF v_actor IS NULL OR p_user_id IS DISTINCT FROM v_actor
 THEN RAISE EXCEPTION 'Foreign workspace identity denied'
  USING ERRCODE='42501'; END IF;
 v_sid:=private.ws01_signed_actor_session();
 SELECT m.workspace_id INTO v_fallback
 FROM public.workspace_members m
 JOIN public.profiles p ON p.id=m.user_id
 WHERE m.user_id=v_actor AND m.active IS TRUE AND p.status='active'
 ORDER BY m.created_at,m.workspace_id LIMIT 1;
 IF v_fallback IS NULL THEN
  RAISE EXCEPTION 'Active workspace membership required'
  USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.ws01_lifecycle_flags
    WHERE id IS TRUE AND selection_enabled IS TRUE)
 THEN RETURN v_fallback; END IF;
 SELECT c.workspace_id INTO v_chosen
 FROM private.ws01_session_choices c
 JOIN public.workspace_members m ON m.workspace_id=c.workspace_id
   AND m.user_id=v_actor AND m.active IS TRUE
 WHERE c.actor_id=v_actor AND c.session_id=v_sid;
 RETURN coalesce(v_chosen,v_fallback);
END $scope$;
REVOKE ALL ON FUNCTION public.current_workspace_id(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_workspace_id(uuid) TO authenticated;

-- Validate fallback, previous selections and board-scope for multi-member.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'cccccccc-0000-4000-8000-000000000003',true);
DO $h_before_switch$
DECLARE catalog jsonb; boards jsonb;
BEGIN
 IF public.current_workspace_id() IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Multi-member fallback changed before switch'; END IF;
 catalog:=public.wm_ws01_list();
 IF catalog->>'activeWorkspaceId' IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000001'
  OR pg_catalog.jsonb_array_length(catalog->'rows')<>2
 THEN RAISE EXCEPTION 'Signed two-workspace catalog regressed'; END IF;
 boards:=public.ws01_fixture_visible_boards();
 IF pg_catalog.jsonb_array_length(boards)<>1
  OR boards->0->>'id' IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'
 THEN RAISE EXCEPTION 'Pre-switch board scoping regressed'; END IF;
END $h_before_switch$;
DO $h_switch$
DECLARE receipt jsonb;
BEGIN
 receipt:=public.wm_ws01_select(
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001');
 IF receipt->>'switched'<>'true'
  OR receipt->>'previousWorkspaceId'<>'00000000-0000-4000-8000-000000000001'
 THEN RAISE EXCEPTION 'Authoritative signed switch receipt regressed'; END IF;
END $h_switch$;
-- STABLE function visibility requires a new statement to observe the change.
DO $h_after_switch$
DECLARE catalog jsonb; boards jsonb; denied boolean:=false;
BEGIN
 IF public.current_workspace_id() IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000002'::uuid
 THEN RAISE EXCEPTION 'Hardened lookup did not honor signed selection'; END IF;
 boards:=public.ws01_fixture_visible_boards();
 IF pg_catalog.jsonb_array_length(boards)<>1
  OR boards->0->>'id' IS DISTINCT FROM '22222222-2222-4222-8222-222222222222'
 THEN RAISE EXCEPTION 'Cross-workspace board isolation after switch failed'; END IF;
 catalog:=public.wm_ws01_list();
 IF catalog->>'activeWorkspaceId' IS DISTINCT FROM
  '00000000-0000-4000-8000-000000000002'
 THEN RAISE EXCEPTION 'Signed workspace discovery not synchronized'; END IF;
 BEGIN
  PERFORM public.current_workspace_id(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Foreign UUID disclosed an actor scope'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_select(
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale session CAS was not rejected'; END IF;
END $h_after_switch$;
RESET ROLE;

-- Only synthetic owner policy changes, inside the rollback-bound test.
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
VALUES('00000000-0000-4000-8000-000000000002',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','owner')
ON CONFLICT(workspace_id,user_id) DO UPDATE SET relation='owner';
INSERT INTO private.ws01_workspace_policy(workspace_id,privacy,created_by)
VALUES('00000000-0000-4000-8000-000000000002','closed',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
ON CONFLICT(workspace_id) DO NOTHING;
UPDATE private.ws01_config_flags SET enabled=true WHERE id IS TRUE;
GRANT EXECUTE ON FUNCTION public.wm_ws01_config_read(uuid),
 public.wm_ws01_config_update(uuid,text,text,bigint) TO authenticated;

SET ROLE authenticated;
DO $h_config_owner$
DECLARE receipt jsonb; denied boolean:=false;
BEGIN
 receipt:=public.wm_ws01_config_read(
  '00000000-0000-4000-8000-000000000002');
 IF receipt->>'canEdit'<>'true' OR receipt->>'revision'<>'1'
 THEN RAISE EXCEPTION 'Selected workspace owner edit permission unavailable'; END IF;
 receipt:=public.wm_ws01_config_update(
  '00000000-0000-4000-8000-000000000002',
  'Phase H Authorized Workspace','open',1);
 IF receipt->>'updated'<>'true' OR receipt->>'revision'<>'2'
 THEN RAISE EXCEPTION 'Owner CAS failed under signed workspace switch'; END IF;
 BEGIN
  PERFORM public.wm_ws01_config_update(
   '00000000-0000-4000-8000-000000000002',
   'Phase H Stale Workspace','closed',1);
 EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Stale owner configuration revision accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_update(
   '00000000-0000-4000-8000-000000000001',
   'Foreign Unauthorized','closed',1);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Owner permission crossed workspace boundary'; END IF;
END $h_config_owner$;
RESET ROLE;
-- H2 delegated-role preview runs with Phase H's selected-workspace guard active.
\i sql/tests/cp-ws01-phase-h2-scoped-delegation-disposable.sql
UPDATE private.ws02d_invitation_flags SET enabled=true WHERE id IS TRUE;

-- The trusted BACKEND private issuer remains unavailable to signed browser roles.
DO $h_invite_and_role$
DECLARE result jsonb; retry jsonb;
BEGIN
 IF has_function_privilege('authenticated',
   'private.ws02d_issue(uuid,text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon',
   'private.ws02d_issue(uuid,text,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Private invitation issuer exposed to client'; END IF;
 IF private.ws02d_sender_authorized(
  '00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc') IS TRUE
 THEN RAISE EXCEPTION 'Invitation sender was authorized outside active workspace'; END IF;
 IF private.ws02d_sender_authorized(
  '00000000-0000-4000-8000-000000000002',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Selected workspace owner denied invitation rights'; END IF;
 result:=private.ws02d_issue(
  '00000000-0000-4000-8000-000000000002',
  'phase-h-recipient@example.invalid','member',
  '11111111-2222-4333-8444-555555555555');
 IF result->>'state'<>'pending' OR result->>'tokenAvailable'<>'true'
 THEN RAISE EXCEPTION 'Trusted synthetic invitation issuance regressed'; END IF;
 retry:=private.ws02d_issue(
  '00000000-0000-4000-8000-000000000002',
  'phase-h-recipient@example.invalid','member',
  '11111111-2222-4333-8444-555555555555');
 IF retry->>'idempotent'<>'true' OR retry ? 'token'
 THEN RAISE EXCEPTION 'Trusted invitation replay disclosed token'; END IF;
 IF (SELECT count(*) FROM private.ws02d_invitations
   WHERE workspace_id='00000000-0000-4000-8000-000000000002'
     AND request_id='11111111-2222-4333-8444-555555555555')<>1
 THEN RAISE EXCEPTION 'Trusted issue did not persist exactly once'; END IF;
END $h_invite_and_role$;

-- Other signed actor must retain its own workspace and cannot inspect target.
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'aaaaaaaa-0000-4000-8000-000000000001',true);
DO $h_independent_actor$
DECLARE denied boolean:=false;
BEGIN
 IF public.current_workspace_id() IS DISTINCT FROM
   '00000000-0000-4000-8000-000000000001'::uuid
 THEN RAISE EXCEPTION 'Independent signed actor inherited other session selection'; END IF;
 BEGIN
  PERFORM public.current_workspace_id(
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Hardened lookup accepted borrowed target actor'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_read(
   '00000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Foreign workspace metadata leaked to actor'; END IF;
END $h_independent_actor$;
RESET ROLE;

-- The formerly selected actor must lose all workspace scope after expiry.
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='cccccccc-0000-4000-8000-000000000003';
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT pg_catalog.set_config('request.jwt.claim.session_id',
 'cccccccc-0000-4000-8000-000000000003',true);
DO $h_expired_session$
DECLARE denied boolean:=false;
BEGIN
 BEGIN PERFORM public.current_workspace_id();
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Expired signed workspace retained scope'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_select(
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Expired session could switch'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_update(
   '00000000-0000-4000-8000-000000000002',
   'Expired Mutation','closed',2);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Expired session could configure'; END IF;
END $h_expired_session$;
RESET ROLE;

SET ROLE anon;
DO $h_anon$
DECLARE denied boolean:=false;
BEGIN
 BEGIN PERFORM public.current_workspace_id();
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Anonymous workspace lookup succeeded'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.wm_ws01_config_read(
   '00000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Anonymous workspace configuration succeeded'; END IF;
END $h_anon$;
RESET ROLE;

DO $h_accept$
BEGIN
 IF (SELECT count(*) FROM private.ws01_config_events
   WHERE workspace_id='00000000-0000-4000-8000-000000000002')<>1
  OR (SELECT count(*) FROM private.ws02d_invitations
    WHERE request_id='11111111-2222-4333-8444-555555555555')<>1
  OR (SELECT count(*) FROM public.workspace_members WHERE active IS TRUE)<>
   current_setting('cp_ws01_h.prior_members')::bigint
 THEN RAISE EXCEPTION 'Cross-contract audit or membership integrity lost'; END IF;
 RAISE NOTICE 'CP_WS01_PHASE_H_CROSS_CONTRACT_HARDENED_DISPOSABLE_PASS';
END $h_accept$;
ROLLBACK;

DO $h_rollback$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('private.ws01_h2_scoped_role_actor(uuid)') IS NOT NULL
  OR to_regprocedure('public.ws01_h2_scoped_role_review(uuid)') IS NOT NULL
  OR (SELECT count(*) FROM private.ws01_config_events)<>0
  OR (SELECT count(*) FROM private.ws01_config_revisions)<>0
  OR (SELECT count(*) FROM private.ws02d_invitations)<>0
  OR (SELECT count(*) FROM public.workspace_members WHERE active IS TRUE)<>
   current_setting('cp_ws01_h.prior_members')::bigint
  OR (SELECT count(*) FROM private.ws01_events)<>
   current_setting('cp_ws01_h.prior_events')::bigint
  OR (SELECT enabled FROM private.ws01_config_flags WHERE id IS TRUE)
  OR (SELECT enabled FROM private.ws02d_invitation_flags WHERE id IS TRUE)
  OR (SELECT name FROM public.workspaces
      WHERE id='00000000-0000-4000-8000-000000000002')<>'Foreign Workspace'
  OR pg_get_functiondef('public.current_workspace_id(uuid)'::regprocedure)
     NOT LIKE '%v_fallback%'
 THEN RAISE EXCEPTION 'Phase H disposable scope or ACL was not restored'; END IF;
 RAISE NOTICE 'CP_WS01_PHASE_H_CROSS_CONTRACT_ROLLBACK_PASS';
END $h_rollback$;
