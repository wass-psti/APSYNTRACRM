-- CP-WS-02D/B2: signed board ACL + maximum workspace role, never OR.
-- Disposable PG17 synthetic users only. No production writes.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
  OR to_regprocedure('public.work_board_access(uuid,text)') IS NULL
  OR pg_get_functiondef('public.work_board_access(uuid,text)'::regprocedure)
     NOT LIKE '%IF NOT private.ws02d_workspace_ceiling(ws,caller,p_required) THEN RETURN false; END IF;%'
  OR NOT has_function_privilege('authenticated',
   'public.work_board_access(uuid,text)','EXECUTE')
  OR has_function_privilege('anon',
   'public.work_board_access(uuid,text)','EXECUTE')
  OR (SELECT enabled OR advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'Integrated board ACL test fixture invalid'
 USING ERRCODE='42501'; END IF;
END $pre$;
BEGIN;
-- Existing B4 disposable acceptance deliberately revoked C's original
-- GoTrue session and left C's recovered session ...0003 active. Reuse
-- the real surviving synthetic session; do not weaken the session guard.
DO $session_ready$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s
  WHERE s.id='cccccccc-0000-4000-8000-000000000003'
   AND s.user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
   AND (s.not_after IS NULL OR s.not_after>now()))
 THEN RAISE EXCEPTION 'Required recovered synthetic session missing'; END IF;
END $session_ready$;
-- Old board ACL assigned D a board Owner and can give global admin fastpath;
-- the new role ceiling must deny edit/manage for a scoped Viewer anyway.
UPDATE public.profiles SET platform_role='admin_general_manager'
 WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
INSERT INTO private.ws01_member_roles(workspace_id,user_id,relation)
 VALUES('00000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner');
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer'),
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member');

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT set_config('request.jwt.claim.session_id','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $existing_owner$
BEGIN
 IF NOT public.work_board_access('11111111-1111-4111-8111-111111111111','manage')
  OR public.work_board_access('22222222-2222-4222-8222-222222222222','view')
  OR public.work_board_access('11111111-1111-4111-8111-111111111111','invalid')
 THEN RAISE EXCEPTION 'Existing platform admin/owner behavior regressed'; END IF;
END $existing_owner$;

SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $disabled_viewer$
BEGIN
 IF public.work_board_access('11111111-1111-4111-8111-111111111111','view')
  OR public.work_board_access('11111111-1111-4111-8111-111111111111','edit')
  OR public.work_board_access('11111111-1111-4111-8111-111111111111','manage')
 THEN RAISE EXCEPTION 'Advanced Viewer was activated while flag disabled'; END IF;
END $disabled_viewer$;
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id IS TRUE;
DO $viewer_cap$
BEGIN
 IF NOT public.work_board_access('11111111-1111-4111-8111-111111111111','view')
  OR public.work_board_access('11111111-1111-4111-8111-111111111111','edit')
  OR public.work_board_access('11111111-1111-4111-8111-111111111111','manage')
 THEN RAISE EXCEPTION 'Scoped Viewer escaped platform-admin or board Owner fastpath'; END IF;
END $viewer_cap$;

SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $member$
BEGIN
 IF NOT public.work_board_access('11111111-1111-4111-8111-111111111111','view')
  OR NOT public.work_board_access('11111111-1111-4111-8111-111111111111','edit')
  OR public.work_board_access('11111111-1111-4111-8111-111111111111','manage')
  OR public.work_board_access('22222222-2222-4222-8222-222222222222','view')
 THEN RAISE EXCEPTION 'Legacy editor and Member ceiling mismatched'; END IF;
END $member$;
-- Admin upper bound cannot override missing board manage privilege or
-- the platform role ceiling (employee never gets board manage).
UPDATE private.ws02d_member_access SET role='admin'
 WHERE workspace_id='00000000-0000-4000-8000-000000000001'
 AND user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $admin_ceiling$
BEGIN
 IF public.work_board_access('11111111-1111-4111-8111-111111111111','manage')
 THEN RAISE EXCEPTION 'Workspace Admin bypassed platform employee ceiling'; END IF;
END $admin_ceiling$;
UPDATE public.profiles SET platform_role='hr'
 WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $no_or_grant$
BEGIN
 IF public.work_board_access('11111111-1111-4111-8111-111111111111','manage')
  OR NOT public.work_board_access('11111111-1111-4111-8111-111111111111','edit')
 THEN RAISE EXCEPTION 'Workspace Admin granted manage without board Owner ACL'; END IF;
END $no_or_grant$;
-- A genuine board ACL Owner in a non-employee tier may manage its board.
UPDATE public.work_board_members SET role='owner'
 WHERE board_id='11111111-1111-4111-8111-111111111111'
 AND user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
DO $both_required$
BEGIN
 IF NOT public.work_board_access('11111111-1111-4111-8111-111111111111','manage')
 THEN RAISE EXCEPTION 'Admin ceiling AND board Owner manage not recognized'; END IF;
END $both_required$;

-- Signed foreign workspace and revoked GoTrue sessions remain denied.
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign$
BEGIN
 IF NOT public.work_board_access('22222222-2222-4222-8222-222222222222','view')
 OR public.work_board_access('11111111-1111-4111-8111-111111111111','view')
 THEN RAISE EXCEPTION 'Foreign board access scope incorrect'; END IF;
END $foreign$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
DO $revoked$
BEGIN
 IF public.work_board_access('22222222-2222-4222-8222-222222222222','view')
 THEN RAISE EXCEPTION 'Expired session could access board'; END IF;
END $revoked$;
ROLLBACK;
DO $rollback$
BEGIN
 IF (SELECT count(*) FROM private.ws02d_member_access)<>0
  -- Previous B4 acceptance retained C's one synthetic collaborator relation.
 -- Rollback must restore that fixture, not erase it.
 OR (SELECT count(*) FROM private.ws01_member_roles)<>1
 OR (SELECT count(*) FROM private.ws01_member_roles r WHERE
   r.workspace_id='00000000-0000-4000-8000-000000000002'
   AND r.user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
   AND r.relation='collaborator')<>1
  OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
  OR (SELECT count(*) FROM public.workspace_members WHERE active)<>5
  OR (SELECT count(*) FROM public.work_board_members)<>4
 THEN RAISE EXCEPTION 'Role integration fixture rollback failed'; END IF;
 RAISE NOTICE 'CP-WS-02D/B2 integrated board permission ceiling PASS';
END $rollback$;
