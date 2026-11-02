-- Disposable-only revocation and stale membership acceptance.
\set ON_ERROR_STOP on
-- Preserve original aggregate counts before any fixture membership revocation.
CREATE TEMP TABLE col01_rollback_state AS
 SELECT (SELECT count(*) FROM public.work_board_members)::integer memberships,
        (SELECT count(*) FROM public.work_board_events)::integer events,
        (SELECT count(*) FROM public.work_board_item_updates)::integer updates,
        (SELECT count(*) FROM public.work_board_item_files)::integer files;

-- Simulate an immediate board-access revoke; a still-authenticated user must be denied.
DELETE FROM public.work_board_members
 WHERE board_id='30000000-0000-4000-8000-000000000001'
  AND user_id='20000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000002',false);
DO $revoked$
BEGIN
 BEGIN
   PERFORM public.wm_list_board_item_updates('40000000-0000-4000-8000-000000000001',10);
   RAISE EXCEPTION 'COL01 revoked member can read updates';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.wm_list_board_item_files('40000000-0000-4000-8000-000000000001',10);
   RAISE EXCEPTION 'COL01 revoked member can read files';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.wm_list_board_events_page('30000000-0000-4000-8000-000000000001',NULL,10);
   RAISE EXCEPTION 'COL01 revoked member can read board events';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $revoked$;
RESET ROLE;

-- Restore fixture membership, then deactivate a workspace membership.
INSERT INTO public.work_board_members(board_id,user_id,role,added_by)
 VALUES('30000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000002','editor',
        '20000000-0000-4000-8000-000000000001');
UPDATE public.workspace_members SET active=false
 WHERE workspace_id='10000000-0000-4000-8000-000000000001'
  AND user_id='20000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000002',false);
DO $inactive$
BEGIN
 BEGIN
   PERFORM public.wm_list_board_item_updates('40000000-0000-4000-8000-000000000001',10);
   RAISE EXCEPTION 'COL01 inactive workspace member can read updates';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.wm_list_board_item_files('40000000-0000-4000-8000-000000000001',10);
   RAISE EXCEPTION 'COL01 inactive workspace member can read files';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $inactive$;
RESET ROLE;
UPDATE public.workspace_members SET active=true
 WHERE workspace_id='10000000-0000-4000-8000-000000000001'
 AND user_id='20000000-0000-4000-8000-000000000002';

-- Simulate a still-unexpired JWT whose auth.sessions entry has been removed.
DELETE FROM auth.sessions
 WHERE id='70000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
SELECT set_config('request.jwt.claim.session_id','70000000-0000-4000-8000-000000000002',false);
DO $revoked_gotrue$
BEGIN
 BEGIN
  PERFORM public.wm_list_board_item_updates('40000000-0000-4000-8000-000000000001',10);
  RAISE EXCEPTION 'COL01 removed GoTrue session still reads item updates';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_list_board_item_files('40000000-0000-4000-8000-000000000001',10);
  RAISE EXCEPTION 'COL01 removed GoTrue session still reads item files';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_list_board_events_page('30000000-0000-4000-8000-000000000001',NULL,10);
  RAISE EXCEPTION 'COL01 removed GoTrue session still reads events';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $revoked_gotrue$;
RESET ROLE;
INSERT INTO auth.sessions(id,user_id) VALUES
 ('70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');

-- No real Supabase GoTrue session ID is simulated here.
-- Expired/revoked GoTrue bearer-token acceptance remains an independent
-- signed HTTP / production activation gate.
DO $verify$
DECLARE s record;
BEGIN
 SELECT * INTO s FROM col01_rollback_state;
 IF s.memberships<>(SELECT count(*) FROM public.work_board_members)
 OR s.events<>(SELECT count(*) FROM public.work_board_events)
 OR s.updates<>(SELECT count(*) FROM public.work_board_item_updates)
 OR s.files<>(SELECT count(*) FROM public.work_board_item_files)
 THEN RAISE EXCEPTION 'COL01 synthetic test altered fixture integrity'; END IF;
 RAISE NOTICE 'COL01 synthetic membership revocation and session-context denial PASS';
END $verify$;
