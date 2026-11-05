-- CP-WS-02D/B2: actual standard/configured board create RPCs + role denial.
-- Disposable PostgreSQL 17 only. Full transaction rollback.
\set ON_ERROR_STOP on
DO $pre$
BEGIN
 IF current_database()<>'workspace_disposable'
 OR pg_get_functiondef('public.wm_create_board(text,text)'::regprocedure)
  NOT LIKE '%private.ws02d_workspace_ceiling(ws,caller,''edit'')%'
 OR pg_get_functiondef('public.wm_create_board_configured(text,text,jsonb)'::regprocedure)
  NOT LIKE '%private.ws02d_workspace_ceiling(ws,caller,''edit'')%'
 OR has_function_privilege('anon','public.wm_create_board(text,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
    'public.wm_create_board_configured(text,text,jsonb)','EXECUTE')
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'WS02D/B2 board create replacement unavailable'
 USING ERRCODE='42501'; END IF;
END $pre$;
CREATE TEMP TABLE ws02d_b2_create_baseline ON COMMIT PRESERVE ROWS AS SELECT
 (SELECT count(*) FROM public.work_boards) AS boards,
 (SELECT count(*) FROM public.work_board_members) AS board_members,
 (SELECT count(*) FROM public.work_board_groups) AS groups,
 (SELECT count(*) FROM public.work_board_columns) AS columns,
 (SELECT count(*) FROM public.ws02d_b2_fixture_board_events) AS events,
 (SELECT count(*) FROM private.ws02d_member_access) AS roles;
BEGIN;
-- Ordinary Member can create and configure boards in their signed workspace.
INSERT INTO private.ws02d_member_access(workspace_id,user_id,role) VALUES
 ('00000000-0000-4000-8000-000000000001',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('00000000-0000-4000-8000-000000000001',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer');
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $member_create$
DECLARE plain uuid; configured uuid;
BEGIN
 plain:=public.wm_create_board('Member Board','Owned by an ordinary member');
 configured:=public.wm_create_board_configured(
  'Configured Board','Within same workspace',
  '[{"name":"Item label","data_type":"text","config":{}}]'::jsonb);
 IF plain IS NULL OR configured IS NULL OR plain=configured
 OR (SELECT count(*) FROM public.work_boards b
      WHERE b.id IN(plain,configured)
      AND b.workspace_id='00000000-0000-4000-8000-000000000001')<>2
 OR (SELECT count(*) FROM public.work_board_members m
      WHERE m.board_id IN(plain,configured)
      AND m.user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      AND m.role='owner')<>2
 OR (SELECT count(*) FROM public.work_board_groups g
      WHERE g.board_id IN(plain,configured))<>2
 OR (SELECT count(*) FROM public.work_board_columns c
      WHERE c.board_id=configured AND c.name='Item label')<>1
 OR (SELECT count(*) FROM public.ws02d_b2_fixture_board_events e
      WHERE e.board_id IN(plain,configured)
      AND e.actor='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>2
 THEN RAISE EXCEPTION 'Member board creation changed domain or audit behavior'; END IF;
END $member_create$;

SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
SELECT set_config('request.jwt.claim.session_id','dddddddd-0000-4000-8000-000000000001',true);
DO $viewer_disabled$
BEGIN
 BEGIN
  PERFORM public.wm_create_board('Forbidden Viewer Board','');
  RAISE EXCEPTION 'Default-disabled Viewer created board' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_create_board_configured('Forbidden Configured','', '[]'::jsonb);
  RAISE EXCEPTION 'Default-disabled Viewer configured board'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $viewer_disabled$;
UPDATE private.ws02d_invitation_flags SET advanced_roles_enabled=true WHERE id;
DO $viewer_enabled$
BEGIN
 BEGIN
  PERFORM public.wm_create_board('Forbidden Active Viewer Board','');
  RAISE EXCEPTION 'Enabled Viewer escaped edit restriction' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_create_board_configured(
   'Forbidden Active Configured Board','', '[]'::jsonb);
  RAISE EXCEPTION 'Enabled Viewer escaped configured edit restriction'
   USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $viewer_enabled$;

-- A scoped Admin may create, but does not acquire platform-administrator role.
UPDATE private.ws02d_member_access SET role='admin'
 WHERE workspace_id='00000000-0000-4000-8000-000000000001'
 AND user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
SELECT set_config('request.jwt.claim.session_id','cccccccc-0000-4000-8000-000000000003',true);
DO $scoped_admin$
DECLARE bid uuid;
BEGIN
 bid:=public.wm_create_board('Admin Scoped Board','');
 IF (SELECT workspace_id FROM public.work_boards WHERE id=bid)
   IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid
 OR (SELECT platform_role FROM public.profiles
   WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')='admin_general_manager'
 THEN RAISE EXCEPTION 'Workspace Admin creation bypassed scope/platform role'; END IF;
END $scoped_admin$;

-- Legacy members outside the new invitation role model retain their
-- existing permitted board creation in their own, not foreign, workspace.
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
SELECT set_config('request.jwt.claim.session_id','bbbbbbbb-0000-4000-8000-000000000001',true);
DO $foreign$
DECLARE bid uuid;
BEGIN
 bid:=public.wm_create_board('Foreign Workspace Board','');
 IF (SELECT workspace_id FROM public.work_boards WHERE id=bid)
    IS DISTINCT FROM '00000000-0000-4000-8000-000000000002'::uuid
 THEN RAISE EXCEPTION 'Foreign signed workspace scope changed'; END IF;
END $foreign$;
UPDATE auth.sessions SET not_after=now()-interval '1 minute'
 WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
DO $expired$
BEGIN
 BEGIN
  PERFORM public.wm_create_board('Expired Board','');
  RAISE EXCEPTION 'Expired session created a board' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_create_board_configured('Expired Configured','', '[]'::jsonb);
  RAISE EXCEPTION 'Expired session created configured board' USING ERRCODE='P9999';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $expired$;
ROLLBACK;
DO $rollback$
DECLARE b record;
BEGIN
 SELECT * INTO STRICT b FROM pg_temp.ws02d_b2_create_baseline;
 IF (SELECT count(*) FROM public.work_boards)<>b.boards
 OR (SELECT count(*) FROM public.work_board_members)<>b.board_members
 OR (SELECT count(*) FROM public.work_board_groups)<>b.groups
 OR (SELECT count(*) FROM public.work_board_columns)<>b.columns
 OR (SELECT count(*) FROM public.ws02d_b2_fixture_board_events)<>b.events
 OR (SELECT count(*) FROM private.ws02d_member_access)<>b.roles
 OR (SELECT advanced_roles_enabled FROM private.ws02d_invitation_flags WHERE id)
 THEN RAISE EXCEPTION 'Board create role ceiling rollback failed'; END IF;
 RAISE NOTICE 'CP-WS-02D/B2 board create Member/Viewer/Admin/expired acceptance PASS';
END $rollback$;
DROP TABLE pg_temp.ws02d_b2_create_baseline;
