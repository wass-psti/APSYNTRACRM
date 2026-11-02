-- CP-BOARD-COL01: all identities, boards, updates, files and roles are disposable.
\set ON_ERROR_STOP on
DO $grants$
BEGIN
 IF has_function_privilege('anon','public.wm_add_board_member(uuid,text,text)','EXECUTE')
   OR has_function_privilege('anon','public.wm_col01_session_active()','EXECUTE')
   OR has_function_privilege('anon','public.wm_board_invitable_users(uuid,text)','EXECUTE')
   OR has_function_privilege('anon','public.wm_list_board_item_updates(uuid,integer)','EXECUTE')
   OR has_function_privilege('anon','public.wm_list_board_item_files(uuid,integer)','EXECUTE')
   OR has_function_privilege('anon','public.wm_list_board_events_page(uuid,bigint,integer)','EXECUTE')
   OR NOT has_function_privilege('authenticated','public.wm_add_board_member(uuid,text,text)','EXECUTE')
   OR NOT has_function_privilege('authenticated','public.wm_col01_session_active()','EXECUTE')
   OR NOT has_function_privilege('authenticated','public.wm_list_board_item_updates(uuid,integer)','EXECUTE')
   OR has_table_privilege('authenticated','public.work_board_item_updates','SELECT')
   OR has_table_privilege('authenticated','public.work_board_item_files','SELECT') THEN
   RAISE EXCEPTION 'COL01 GRANTS FAIL';
 END IF;
END $grants$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false);
DO $owner$
DECLARE
 board uuid:='30000000-0000-4000-8000-000000000001';
 item uuid:='40000000-0000-4000-8000-000000000001';
 blocked boolean;
 cursor_id bigint;
BEGIN
 IF (SELECT count(*) FROM public.wm_board_invitable_users(board,'Editor'))<>1 OR
    (SELECT count(*) FROM public.wm_board_invitable_users(board,'Foreign'))<>0 OR
    (SELECT count(*) FROM public.wm_board_invitable_users(board,'Inactive'))<>0 THEN
   RAISE EXCEPTION 'COL01 directory isolation FAIL';
 END IF;
 -- Workspace member editor succeeds and is audited; no direct table write.
 PERFORM public.wm_add_board_member(board,'EDITOR@example.test','editor');
 IF (SELECT count(*) FROM public.wm_board_invitable_users(board,'Editor')
     WHERE board_role='editor')<>1 THEN
   RAISE EXCEPTION 'COL01 editor assignment FAIL';
 END IF;
 BEGIN
   PERFORM public.wm_add_board_member(board,'foreign@example.test','viewer');
   RAISE EXCEPTION 'COL01 foreign grant unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.wm_add_board_member(board,'viewer@example.test','editor');
   RAISE EXCEPTION 'COL01 ceiling escalation unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.wm_add_board_member(board,'owner@example.test','viewer');
   RAISE EXCEPTION 'COL01 owner demotion unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.wm_add_board_member(board,'inactive@example.test','viewer');
   RAISE EXCEPTION 'COL01 inactive grant unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM public.wm_list_board_item_updates(item,50))<>1 OR
    (SELECT count(*) FROM public.wm_list_board_item_files(item,50))<>1 THEN
   RAISE EXCEPTION 'COL01 scoped item list FAIL';
 END IF;
 IF (SELECT count(*) FROM public.wm_list_board_events_page(board,NULL,2))<>2 THEN
   RAISE EXCEPTION 'COL01 audit first-page bound FAIL';
 END IF;
 SELECT min(e.id) INTO cursor_id FROM public.wm_list_board_events_page(board,NULL,2) e;
 IF (SELECT count(*) FROM public.wm_list_board_events_page(board,cursor_id,2)
   WHERE id>=cursor_id)<>0 THEN
   RAISE EXCEPTION 'COL01 keyset overlap FAIL';
 END IF;
 BEGIN
   PERFORM public.wm_list_board_events_page(board,0,50);
   RAISE EXCEPTION 'COL01 invalid cursor allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 RAISE NOTICE 'COL01 owner acceptance PASS';
END $owner$;
-- Nonmanager editor cannot invite or list the manager-only workspace directory,
-- but can see explicitly authorized board updates.
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
DO $editor$
BEGIN
 IF (SELECT count(*) FROM public.wm_list_board_item_updates(
  '40000000-0000-4000-8000-000000000001',50))<>1 THEN
  RAISE EXCEPTION 'COL01 editor read failed';
 END IF;
 BEGIN
  PERFORM public.wm_board_invitable_users('30000000-0000-4000-8000-000000000001','');
  RAISE EXCEPTION 'COL01 editor directory privilege escalation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_add_board_member('30000000-0000-4000-8000-000000000001','viewer@example.test','viewer');
  RAISE EXCEPTION 'COL01 editor membership escalation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $editor$;
-- Explicit platform Viewer may read only their own authorized board.
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',false);
DO $viewer$
BEGIN
 IF (SELECT count(*) FROM public.wm_list_board_item_files(
   '40000000-0000-4000-8000-000000000001',50))<>1 THEN
  RAISE EXCEPTION 'COL01 viewer authorized file metadata failed';
 END IF;
 BEGIN
   PERFORM public.wm_add_board_member('30000000-0000-4000-8000-000000000001','editor@example.test','editor');
   RAISE EXCEPTION 'COL01 viewer role escalation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $viewer$;
-- Foreign workspace owner must not read any item metadata/events from workspace 1.
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',false);
DO $foreign$
BEGIN
 BEGIN
  PERFORM public.wm_list_board_item_updates('40000000-0000-4000-8000-000000000001',50);
  RAISE EXCEPTION 'COL01 foreign update leaked';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_list_board_item_files('40000000-0000-4000-8000-000000000001',50);
  RAISE EXCEPTION 'COL01 foreign file leaked';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.wm_list_board_events_page('30000000-0000-4000-8000-000000000001',NULL,50);
  RAISE EXCEPTION 'COL01 foreign audit leaked';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $foreign$;
-- Expired/no signed identity denies all signed reads.
SELECT set_config('request.jwt.claim.sub','',false);
DO $expired$
BEGIN
 BEGIN
  PERFORM public.wm_list_board_item_updates('40000000-0000-4000-8000-000000000001',50);
  RAISE EXCEPTION 'COL01 expired access leaked';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $expired$;
RESET ROLE;
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.work_board_members
     WHERE board_id='30000000-0000-4000-8000-000000000001')<>3
 OR EXISTS(SELECT 1 FROM public.work_board_members
    WHERE board_id='30000000-0000-4000-8000-000000000001'
      AND user_id='20000000-0000-4000-8000-000000000004')
 OR EXISTS(SELECT 1 FROM public.work_board_members
    WHERE board_id='30000000-0000-4000-8000-000000000001'
      AND user_id='20000000-0000-4000-8000-000000000003'
      AND role='editor') THEN
  RAISE EXCEPTION 'COL01 final role invariants FAIL';
 END IF;
 RAISE NOTICE 'COL01 PASS — membership, denial, scope, cursor, active session';
END $verify$;
